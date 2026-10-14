-- ---------------------------------------------------------------------------
-- Veloxa Laundry Management: initial multi-tenant schema.
-- Every business row carries org_id; RLS limits access to members of that org.
-- Money is integer pesewas (GHS * 100). Ids are client-generatable UUIDs so the
-- offline outbox can replay inserts idempotently.
-- ---------------------------------------------------------------------------

create extension if not exists pgcrypto;

-- --- enums -----------------------------------------------------------------

create type member_role   as enum ('owner', 'manager', 'staff');
create type order_stage   as enum ('received', 'washing', 'drying', 'ironing', 'ready', 'delivered');
create type item_flag     as enum ('vip', 'delicate', 'stain');
create type msg_channel   as enum ('sms', 'whatsapp');
create type msg_status    as enum ('queued', 'sending', 'sent', 'delivered', 'failed', 'skipped');
create type msg_kind      as enum ('stage', 'reminder', 'manual');
create type pay_method    as enum ('cash', 'momo', 'card', 'bank');
create type plan_tier     as enum ('trial', 'starter', 'growth', 'business');

-- --- tenants ---------------------------------------------------------------

create table organizations (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  slug              text not null unique,
  phone             text,
  code_prefix       text not null default 'VX' check (code_prefix ~ '^[A-Z]{1,4}$'),
  timezone          text not null default 'Africa/Accra',
  currency          text not null default 'GHS',
  plan              plan_tier not null default 'trial',
  paid_until        timestamptz not null default now() + interval '30 days',
  sms_sender_id     text,                          -- registered with the SMS gateway
  whatsapp_enabled  boolean not null default false,
  reminder_after    interval not null default interval '24 hours',
  reminder_max      int not null default 3,
  next_order_number int not null default 1001,
  created_at        timestamptz not null default now()
);

create table memberships (
  org_id     uuid not null references organizations on delete cascade,
  user_id    uuid not null references auth.users on delete cascade,
  role       member_role not null default 'staff',
  display_name text not null,
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index on memberships (user_id);

create table branches (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references organizations on delete cascade,
  name       text not null,
  address    text,
  created_at timestamptz not null default now()
);
create index on branches (org_id);

-- --- membership helpers (security definer avoids RLS recursion) -------------

create function is_member(o uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from memberships where org_id = o and user_id = auth.uid());
$$;

create function has_role(o uuid, roles member_role[]) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from memberships
                 where org_id = o and user_id = auth.uid() and role = any(roles));
$$;

-- --- catalogue -------------------------------------------------------------

create table services (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations on delete cascade,
  label       text not null,
  unit        text not null default 'item',
  price       int not null check (price >= 0),          -- pesewas
  active      boolean not null default true,
  sort        int not null default 0,
  created_at  timestamptz not null default now()
);
create index on services (org_id);

-- --- customers -------------------------------------------------------------

create table customers (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations on delete cascade,
  name        text not null,
  phone       text not null,                             -- E.164, e.g. +233241184477
  vip         boolean not null default false,
  notes       text,
  sms_opt_out boolean not null default false,
  created_at  timestamptz not null default now(),
  unique (org_id, phone)
);
create index on customers (org_id, name);

-- --- orders ----------------------------------------------------------------

create table orders (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations on delete cascade,
  branch_id       uuid references branches on delete set null,
  customer_id     uuid not null references customers on delete restrict,
  code            text not null,                         -- VX-1042; reserved per device
  stage           order_stage not null default 'received',
  express         boolean not null default false,
  total           int not null default 0 check (total >= 0),
  amount_paid     int not null default 0 check (amount_paid >= 0),
  ready_by        timestamptz,
  ready_at        timestamptz,
  collected_at    timestamptz,
  reminders_sent  int not null default 0,
  last_reminder_at timestamptz,
  photo_verified  boolean not null default false,
  tracking_token  text not null unique default encode(gen_random_bytes(12), 'hex'),
  notes           text,
  created_by      uuid references auth.users,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (org_id, code)
);
create index on orders (org_id, stage);
create index on orders (org_id, customer_id);
create index on orders (org_id, created_at desc);

create table order_items (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations on delete cascade,
  order_id    uuid not null references orders on delete cascade,
  tag         text not null,                             -- VX-1042-03
  type        text not null,
  color_name  text,
  color_hex   text,
  service_id  uuid references services on delete set null,
  qty         int not null default 1 check (qty > 0),
  unit_price  int not null check (unit_price >= 0),      -- snapshot at intake
  note        text,
  flag        item_flag,
  photo_path  text,                                      -- storage: item-photos/<org_id>/...
  created_at  timestamptz not null default now(),
  unique (org_id, tag)
);
create index on order_items (order_id);

create table order_events (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references organizations on delete cascade,
  order_id   uuid not null references orders on delete cascade,
  stage      order_stage not null,
  note       text,
  by_user    uuid references auth.users,
  at         timestamptz not null default now()
);
create index on order_events (order_id, at);

create table payments (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations on delete cascade,
  order_id    uuid not null references orders on delete cascade,
  amount      int not null check (amount > 0),
  method      pay_method not null,
  reference   text,
  received_by uuid references auth.users,
  received_at timestamptz not null default now()
);
create index on payments (order_id);

-- --- messaging -------------------------------------------------------------

create table messages (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations on delete cascade,
  customer_id  uuid not null references customers on delete cascade,
  order_id     uuid references orders on delete set null,
  channel      msg_channel not null,
  kind         msg_kind not null,
  body         text not null,
  to_phone     text not null,
  status       msg_status not null default 'queued',
  attempts     int not null default 0,
  provider_id  text,
  error        text,
  created_at   timestamptz not null default now(),
  sent_at      timestamptz
);
create index on messages (status, created_at) where status = 'queued';
create index on messages (org_id, customer_id, created_at desc);

-- --- offline order-code reservation ----------------------------------------
-- A device online calls reserve_order_codes(org, 20) and stores the returned
-- range; it can then mint codes/tags while offline with no collisions.

create function reserve_order_codes(o uuid, n int default 20)
returns table (prefix text, first_number int, last_number int)
language plpgsql security definer set search_path = public as $$
begin
  if not is_member(o) then raise exception 'not a member'; end if;
  if n < 1 or n > 200 then raise exception 'n out of range'; end if;
  return query
    update organizations
       set next_order_number = next_order_number + n
     where id = o
    returning code_prefix, next_order_number - n, next_order_number - 1;
end $$;

-- --- triggers ----------------------------------------------------------------

create function touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

create trigger orders_touch before update on orders
  for each row execute function touch_updated_at();

-- Keep orders.amount_paid in sync with payments.
create function sync_amount_paid() returns trigger
language plpgsql security definer set search_path = public as $$
declare oid uuid := coalesce(new.order_id, old.order_id);
begin
  update orders set amount_paid = coalesce((select sum(amount) from payments where order_id = oid), 0)
   where id = oid;
  return null;
end $$;

create trigger payments_sync after insert or update or delete on payments
  for each row execute function sync_amount_paid();

-- Log every stage change and queue customer messages when an order is ready.
create function on_order_stage() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  c   customers;
  org organizations;
  balance text;
begin
  if tg_op = 'UPDATE' and new.stage = old.stage then return new; end if;

  insert into order_events (org_id, order_id, stage, by_user)
  values (new.org_id, new.id, new.stage, auth.uid());

  if new.stage = 'ready' then
    update orders set ready_at = now() where id = new.id and ready_at is null;
    select * into c   from customers     where id = new.customer_id;
    select * into org from organizations where id = new.org_id;
    if not c.sms_opt_out then
      balance := case when new.amount_paid >= new.total then 'Fully paid.'
                      else 'Balance: GHS ' || to_char((new.total - new.amount_paid) / 100.0, 'FM999990.00') || '.' end;
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

create trigger orders_stage after insert or update of stage on orders
  for each row execute function on_order_stage();

-- --- signup: create a laundry and make the caller its owner ------------------

create function create_organization(org_name text, org_slug text, owner_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare o uuid;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  insert into organizations (name, slug) values (org_name, org_slug) returning id into o;
  insert into memberships (org_id, user_id, role, display_name) values (o, auth.uid(), 'owner', owner_name);
  insert into branches (org_id, name) values (o, 'Main');
  insert into services (org_id, label, unit, price, sort) values
    (o, 'Wash & Fold',     'item',  800, 1),
    (o, 'Wash & Iron',     'item', 1200, 2),
    (o, 'Dry Clean',       'item', 2500, 3),
    (o, 'Iron Only',       'item',  500, 4),
    (o, 'Duvet / Bedding', 'piece', 4000, 5);
  return o;
end $$;

-- --- public tracking (customer, no login) -----------------------------------

create function get_tracking(token text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'shop',     org.name,
    'code',     o.code,
    'stage',    o.stage,
    'ready_by', o.ready_by,
    'total',    o.total,
    'paid',     o.amount_paid,
    'customer', split_part(c.name, ' ', 1),
    'items',    (select coalesce(jsonb_agg(jsonb_build_object(
                    'tag', i.tag, 'type', i.type, 'color', i.color_name, 'qty', i.qty) order by i.tag), '[]')
                 from order_items i where i.order_id = o.id),
    'timeline', (select coalesce(jsonb_agg(jsonb_build_object('stage', e.stage, 'at', e.at) order by e.at), '[]')
                 from order_events e where e.order_id = o.id)
  )
  from orders o
  join customers c     on c.id = o.customer_id
  join organizations org on org.id = o.org_id
  where o.tracking_token = token;
$$;

grant execute on function get_tracking(text) to anon;

-- --- row level security ----------------------------------------------------

alter table organizations enable row level security;
alter table memberships   enable row level security;
alter table branches      enable row level security;
alter table services      enable row level security;
alter table customers     enable row level security;
alter table orders        enable row level security;
alter table order_items   enable row level security;
alter table order_events  enable row level security;
alter table payments      enable row level security;
alter table messages      enable row level security;

-- Organizations: members read; owners edit settings. Plan/billing columns are
-- changed only by the service role (billing webhook), enforced by column grants.
create policy org_read   on organizations for select using (is_member(id));
create policy org_update on organizations for update using (has_role(id, '{owner}'));
revoke update on organizations from authenticated;
grant update (name, phone, code_prefix, timezone, sms_sender_id, reminder_after, reminder_max)
  on organizations to authenticated;

-- Memberships: members see their team; owners manage it.
create policy mem_read  on memberships for select using (is_member(org_id));
create policy mem_write on memberships for all
  using (has_role(org_id, '{owner}')) with check (has_role(org_id, '{owner}'));

-- Settings-type tables: everyone reads, owners/managers write.
create policy branches_read  on branches for select using (is_member(org_id));
create policy branches_write on branches for all
  using (has_role(org_id, '{owner,manager}')) with check (has_role(org_id, '{owner,manager}'));
create policy services_read  on services for select using (is_member(org_id));
create policy services_write on services for all
  using (has_role(org_id, '{owner,manager}')) with check (has_role(org_id, '{owner,manager}'));

-- Day-to-day tables: any member reads/writes; only owners/managers delete.
do $$
declare t text;
begin
  foreach t in array array['customers', 'orders', 'order_items', 'payments'] loop
    execute format('create policy %1$s_read   on %1$s for select using (is_member(org_id))', t);
    execute format('create policy %1$s_insert on %1$s for insert with check (is_member(org_id))', t);
    execute format('create policy %1$s_update on %1$s for update using (is_member(org_id)) with check (is_member(org_id))', t);
    execute format('create policy %1$s_delete on %1$s for delete using (has_role(org_id, ''{owner,manager}''))', t);
  end loop;
end $$;

-- Events are written by trigger only; members read.
create policy events_read on order_events for select using (is_member(org_id));

-- Messages: members read and queue manual messages; status is updated by the
-- sender Edge Function using the service role.
create policy messages_read   on messages for select using (is_member(org_id));
create policy messages_insert on messages for insert
  with check (is_member(org_id) and status = 'queued' and kind = 'manual');

-- --- storage: item photos, one folder per org ---------------------------------

insert into storage.buckets (id, name, public) values ('item-photos', 'item-photos', false)
on conflict (id) do nothing;

create policy photos_read on storage.objects for select
  using (bucket_id = 'item-photos' and is_member(((storage.foldername(name))[1])::uuid));
create policy photos_write on storage.objects for insert
  with check (bucket_id = 'item-photos' and is_member(((storage.foldername(name))[1])::uuid));
