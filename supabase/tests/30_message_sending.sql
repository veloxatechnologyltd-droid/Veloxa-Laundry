-- claim_messages / finish_message, opt-out at send time, night hold, usage view.
\set ON_ERROR_STOP 1

create function pg_temp.expect(ok boolean, label text) returns void language plpgsql as $$
begin
  if not ok then raise exception 'FAIL: %', label; end if;
  raise notice 'ok - %', label;
end $$;

select id as org_a from organizations where slug = 'kappa7' \gset
update organizations set sms_sender_id = 'KAPPA7' where id = :'org_a';

-- Start clean: earlier tests left queued messages.
update messages set status = 'skipped' where status = 'queued';

insert into customers (id, org_id, name, phone, sms_opt_out) values
  ('55555555-5555-5555-5555-555555555555', :'org_a', 'Ama Owusu', '+233205538890', false),
  ('66666666-6666-6666-6666-666666666666', :'org_a', 'Opted Out', '+233200000001', false);
insert into messages (id, org_id, customer_id, channel, kind, body, to_phone) values
  ('a0000000-0000-0000-0000-000000000001', :'org_a', '55555555-5555-5555-5555-555555555555', 'sms', 'manual', 'one', '+233205538890'),
  ('a0000000-0000-0000-0000-000000000002', :'org_a', '55555555-5555-5555-5555-555555555555', 'sms', 'manual', 'two', '+233205538890'),
  ('a0000000-0000-0000-0000-000000000003', :'org_a', '66666666-6666-6666-6666-666666666666', 'sms', 'manual', 'three', '+233200000001'),
  ('a0000000-0000-0000-0000-000000000004', :'org_a', '55555555-5555-5555-5555-555555555555', 'whatsapp', 'manual', 'wa', '+233205538890');
-- Customer opts out after the message was queued.
update customers set sms_opt_out = true where id = '66666666-6666-6666-6666-666666666666';

create temp table claimed as select * from claim_messages('sms', 10);
select pg_temp.expect((select count(*) from claimed) = 2, 'claims queued SMS only (not WhatsApp, not opted out)');
select pg_temp.expect((select bool_and(sender_id = 'KAPPA7') from claimed), 'claim returns the org sender ID');
select pg_temp.expect((select status from messages where id = 'a0000000-0000-0000-0000-000000000003') = 'skipped', 'opted-out customer skipped at send time');
select pg_temp.expect((select count(*) from claim_messages('sms', 10)) = 0, 'claimed messages are not handed out twice');

select pg_temp.expect(finish_message('a0000000-0000-0000-0000-000000000001', true, 'prov-1', null, 1) = 'sent', 'success → sent');
select pg_temp.expect((select sent_at is not null and provider_id = 'prov-1' from messages where id = 'a0000000-0000-0000-0000-000000000001'), 'sent_at + provider id recorded');
select pg_temp.expect(finish_message('a0000000-0000-0000-0000-000000000002', false, null, 'timeout') = 'queued', 'first failure is retried');
select pg_temp.expect(finish_message('a0000000-0000-0000-0000-000000000001', false, null, 'late') is null, 'finishing a non-sending message does nothing');

select claim_messages('sms', 10);
select finish_message('a0000000-0000-0000-0000-000000000002', false, null, 'timeout');
select claim_messages('sms', 10);
select pg_temp.expect(finish_message('a0000000-0000-0000-0000-000000000002', false, null, 'bad number') = 'failed', 'fails for good after 3 attempts');
select pg_temp.expect((select error from messages where id = 'a0000000-0000-0000-0000-000000000002') = 'bad number', 'last error kept');

-- A sender that crashed mid-send: rows stuck in "sending" come back after 10 minutes.
update messages set status = 'queued', attempts = 0 where id = 'a0000000-0000-0000-0000-000000000002';
select claim_messages('sms', 10);
update messages set claimed_at = now() - interval '11 minutes' where id = 'a0000000-0000-0000-0000-000000000002';
select pg_temp.expect((select count(*) from claim_messages('sms', 10)) = 1, 'stuck sending message is reclaimed');

-- Usage view counts sent segments.
select pg_temp.expect((select segments from sms_usage where org_id = :'org_a') = 1, 'sms_usage counts segments');

-- App users cannot call the sender functions.
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
\set ON_ERROR_STOP 0
select claim_messages('sms', 10);
select finish_message('a0000000-0000-0000-0000-000000000002', true, 'fake', null, 1);
\set ON_ERROR_STOP 1
select pg_temp.expect((select status from messages where id = 'a0000000-0000-0000-0000-000000000002') = 'sending', 'app users cannot claim or finish messages');
-- Members see their own usage through RLS.
select pg_temp.expect((select count(*) from sms_usage) = 1, 'member sees own usage');
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
select pg_temp.expect((select count(*) from sms_usage) = 0, 'other users see no usage');
reset role;

-- Night hold: an overdue reminder waits until 07:00 Accra.
update orders set stage = 'ready', reminders_sent = 0, ready_at = date_trunc('day', now()) - interval '2 days',
  last_reminder_at = null where code = 'VX-1002';
select pg_temp.expect(queue_due_reminders(date_trunc('day', now()) + interval '23 hours') = 0, 'no reminders at 23:00');
select pg_temp.expect(queue_due_reminders(date_trunc('day', now()) + interval '6 hours 59 minutes') = 0, 'no reminders at 06:59');
select pg_temp.expect(queue_due_reminders(date_trunc('day', now()) + interval '7 hours') = 1, 'reminder goes out at 07:00');

\echo ALL 0004 TESTS PASSED
