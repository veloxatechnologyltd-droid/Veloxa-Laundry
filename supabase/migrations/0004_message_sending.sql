-- ---------------------------------------------------------------------------
-- 0004: message sending support for the send-messages Edge Function, SMS usage
-- metering, and no reminders at night. See docs/MESSAGING.md.
-- ---------------------------------------------------------------------------

alter table messages add column claimed_at timestamptz;   -- when the sender took it
alter table messages add column segments   int;           -- SMS parts billed by the provider

-- --- claim a batch -------------------------------------------------------------
-- Called by the sender (service role) only. Recovers messages stuck in
-- "sending" (sender crashed), skips customers who opted out after the message
-- was queued, then marks up to p_batch queued messages as sending and returns
-- them. "for update skip locked" means two sender runs never get the same row.

create function claim_messages(p_channel msg_channel, p_batch int default 50)
returns table (id uuid, org_id uuid, to_phone text, body text, attempts int, sender_id text)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
begin
  update messages set status = 'queued'
   where status = 'sending' and claimed_at < now() - interval '10 minutes';

  update messages m set status = 'skipped', error = 'customer opted out'
    from customers c
   where c.id = m.customer_id and c.sms_opt_out
     and m.status = 'queued' and m.channel = p_channel;

  return query
  with batch as (
    select m.id from messages m
     where m.status = 'queued' and m.channel = p_channel
     order by m.created_at
     limit p_batch
     for update skip locked
  )
  update messages m
     set status = 'sending', attempts = m.attempts + 1, claimed_at = now()
    from batch, organizations o
   where m.id = batch.id and o.id = m.org_id
  returning m.id, m.org_id, m.to_phone, m.body, m.attempts, o.sms_sender_id;
end $$;

-- --- record the result ------------------------------------------------------------
-- Success → sent. Failure → back to queued for another try, or failed after 3 attempts.

create function finish_message(p_id uuid, p_ok boolean, p_provider_id text default null,
                               p_error text default null, p_segments int default null)
returns msg_status
language sql security definer set search_path = public as $$
  update messages
     set status      = case when p_ok then 'sent'
                            when attempts < 3 then 'queued'
                            else 'failed' end::msg_status,
         provider_id = coalesce(p_provider_id, provider_id),
         error       = case when p_ok then null else p_error end,
         segments    = coalesce(p_segments, segments),
         sent_at     = case when p_ok then now() end
   where id = p_id and status = 'sending'
  returning status;
$$;

revoke execute on function claim_messages(msg_channel, int) from public, anon, authenticated;
revoke execute on function finish_message(uuid, boolean, text, text, int) from public, anon, authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function claim_messages(msg_channel, int) to service_role;
    grant execute on function finish_message(uuid, boolean, text, text, int) to service_role;
  end if;
end $$;

-- --- usage metering (for billing / limits) -------------------------------------------
-- security_invoker: the caller's RLS applies, so members only see their own org.

create view sms_usage with (security_invoker = true) as
  select org_id,
         date_trunc('month', sent_at at time zone 'Africa/Accra')::date as month,
         count(*)                    as messages,
         coalesce(sum(segments), 0)  as segments
    from messages
   where channel = 'sms' and status in ('sent', 'delivered')
   group by 1, 2;

-- --- reminders only in the daytime -------------------------------------------------
-- Same as 0003 but holds reminders outside 07:00–21:00 in the org's timezone
-- (they go out at the first run after 07:00). `at` is a parameter for tests.

drop function queue_due_reminders();

create function queue_due_reminders(at timestamptz default now()) returns int
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
      and coalesce(o.last_reminder_at, o.ready_at) + org.reminder_after <= at
      and extract(hour from at at time zone org.timezone) between 7 and 20
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
  update orders set reminders_sent = reminders_sent + 1, last_reminder_at = at
   where id in (select order_id from queued);
  get diagnostics n = row_count;
  return n;
end $$;

revoke execute on function queue_due_reminders(timestamptz) from public, anon, authenticated;
