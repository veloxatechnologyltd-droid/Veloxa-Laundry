-- ---------------------------------------------------------------------------
-- 0003: atomic order creation, "ready" SMS only once, staff invites, and
-- scheduled pickup reminders.
-- ---------------------------------------------------------------------------

-- --- shared SMS wording ------------------------------------------------------

create function balance_text(total int, paid int) returns text
language sql immutable as $$
  select case when paid >= total then 'Fully paid.'
              else 'Balance: GHS ' || to_char((total - paid) / 100.0, 'FM999990.00') || '.' end;
$$;

-- --- "ready" messages are queued once per order -----------------------------
-- Before: moving an order back a stage and forward to ready again texted the
-- customer twice. ready_at is set the first time only, so use it as the guard.

create or replace function on_order_stage() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  c   customers;
  org organizations;
  balance text;
begin
  if tg_op = 'UPDATE' and new.stage = old.stage then return new; end if;

  insert into order_events (org_id, order_id, stage, by_user)
  values (new.org_id, new.id, new.stage, auth.uid());

  if new.stage = 'ready' and new.ready_at is null then
    update orders set ready_at = now() where id = new.id;
    select * into c   from customers     where id = new.customer_id;
    select * into org from organizations where id = new.org_id;
    if not c.sms_opt_out then
      balance := balance_text(new.total, new.amount_paid);
      insert into messages (org_id, customer_id, order_id, channel, kind, body, to_phone, status)
      values
        (new.org_id, c.id, new.id, 'sms', 'stage',
         org.name || ': ' || new.code || ' is ready for pickup. ' || balance, c.phone, 'queued'),
        (new.org_id, c.id, new.id, 'whatsapp', 'stage',
         'Hi ' || split_part(c.name, ' ', 1) || ', your order ' || new.code || ' is ready for pickup. ' || balance,
         c.phone, case when org.whatsapp_enabled then 'queued' else 'skipped' end::msg_status);
    end if;
  elsif new.stage = 'delivered' then
    update orders set collected_at = now() where id = new.id and collected_at is null;
  end if;
  return new;
end $$;

-- --- create_order: order + items in one transaction --------------------------
-- Runs as the caller (security invoker), so the normal RLS policies apply.
-- Prices are taken from the org's price list (not trusted from the client),
-- express is +50%. Idempotent on the order id, so the offline outbox can replay it.
--
-- p_order: {id, org_id, customer_id, code, express, ready_by, photo_verified?, notes?}
-- p_items: [{id, tag, type, color_name?, color_hex?, service_id, qty, note?, flag?, photo_path?}]

create function create_order(p_order jsonb, p_items jsonb) returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  o_id    uuid := (p_order->>'id')::uuid;
  o_org   uuid := (p_order->>'org_id')::uuid;
  is_express boolean := coalesce((p_order->>'express')::boolean, false);
  subtotal int;
begin
  if exists (select 1 from orders where id = o_id) then return o_id; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'an order needs at least one item';
  end if;

  insert into orders (id, org_id, customer_id, code, express, ready_by, photo_verified, notes, created_by)
  values (o_id, o_org, (p_order->>'customer_id')::uuid, p_order->>'code', is_express,
          (p_order->>'ready_by')::timestamptz, coalesce((p_order->>'photo_verified')::boolean, false),
          p_order->>'notes', auth.uid());

  insert into order_items (id, org_id, order_id, tag, type, color_name, color_hex, service_id, qty, unit_price, note, flag, photo_path)
  select x.id, o_org, o_id, x.tag, x.type, x.color_name, x.color_hex, x.service_id, x.qty,
         coalesce((select s.price from services s where s.id = x.service_id and s.org_id = o_org), 0),
         x.note, x.flag, x.photo_path
  from jsonb_to_recordset(p_items) as x(id uuid, tag text, type text, color_name text, color_hex text,
       service_id uuid, qty int, note text, flag item_flag, photo_path text);

  select coalesce(sum(unit_price * qty), 0) into subtotal from order_items where order_id = o_id;
  update orders set total = case when is_express then round(subtotal * 1.5)::int else subtotal end
   where id = o_id;
  return o_id;
end $$;

-- --- staff invites ------------------------------------------------------------
-- The owner invites an email address with a role. When someone signs in with
-- that (confirmed) email, the app offers to join. No email is sent by us yet;
-- the owner tells the person to sign up.

create table invites (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations on delete cascade,
  email        text not null check (email = lower(email) and email like '%@%'),
  role         member_role not null default 'staff',
  display_name text not null,
  invited_by   uuid references auth.users,
  created_at   timestamptz not null default now(),
  accepted_at  timestamptz
);
create index on invites (org_id);
create unique index invites_pending_once on invites (org_id, email) where accepted_at is null;

alter table invites enable row level security;
create policy invites_owner on invites for all
  using (has_role(org_id, '{owner}')) with check (has_role(org_id, '{owner}'));

-- Pending invites for the signed-in user's email (they aren't a member yet,
-- so RLS would hide the org; this exposes only id, shop name and role).
create function my_invites()
returns table (id uuid, org_name text, role member_role, display_name text)
language sql stable security definer set search_path = public as $$
  select i.id, o.name, i.role, i.display_name
  from invites i join organizations o on o.id = i.org_id
  where i.accepted_at is null
    and i.email = lower(coalesce(auth.jwt()->>'email', ''))
  order by i.created_at;
$$;

create function accept_invite(invite uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare i invites;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select * into i from invites
   where id = invite and accepted_at is null
     and email = lower(coalesce(auth.jwt()->>'email', ''));
  if not found then raise exception 'invite not found'; end if;
  insert into memberships (org_id, user_id, role, display_name)
  values (i.org_id, auth.uid(), i.role, i.display_name)
  on conflict (org_id, user_id) do nothing;
  update invites set accepted_at = now() where id = i.id;
  return i.org_id;
end $$;

-- --- scheduled pickup reminders ---------------------------------------------------
-- Queues an SMS for orders that have sat in "ready" longer than the org's
-- reminder_after (measured from ready_at, then from the last reminder), up to
-- reminder_max. Manual reminders from the board count towards the max.
-- Called by pg_cron, never by app users.

create function queue_due_reminders() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  with due as (
    select o.id, o.org_id, o.customer_id, o.code, o.total, o.amount_paid, org.name as shop, c.phone
    from orders o
    join organizations org on org.id = o.org_id
    join customers c on c.id = o.customer_id
    where o.stage = 'ready'
      and o.ready_at is not null
      and o.reminders_sent < org.reminder_max
      and coalesce(o.last_reminder_at, o.ready_at) + org.reminder_after <= now()
      and not c.sms_opt_out
    for update of o skip locked
  ), queued as (
    insert into messages (org_id, customer_id, order_id, channel, kind, body, to_phone, status)
    select org_id, customer_id, id, 'sms', 'reminder',
           shop || ': Reminder, ' || code || ' is ready for pickup. ' || balance_text(total, amount_paid),
           phone, 'queued'
    from due
    returning order_id
  )
  update orders set reminders_sent = reminders_sent + 1, last_reminder_at = now()
   where id in (select order_id from queued);
  get diagnostics n = row_count;
  return n;
end $$;

revoke execute on function queue_due_reminders() from public, anon, authenticated;

-- Every 15 minutes, where pg_cron exists (Supabase; not the plain test Postgres).
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('queue-due-reminders', '*/15 * * * *', 'select public.queue_due_reminders()');
  end if;
end $$;
