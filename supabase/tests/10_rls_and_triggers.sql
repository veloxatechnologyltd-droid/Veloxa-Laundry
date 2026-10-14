-- Tenant isolation + trigger tests. Run via supabase/tests/run.sh.
-- Fails (non-zero exit) on the first broken expectation.
\set ON_ERROR_STOP 1

-- Supabase grants these by default; mirror them here.
grant all on all tables in schema public, storage to authenticated;
revoke update on organizations from authenticated;
grant update (name, phone, code_prefix, timezone, sms_sender_id, reminder_after, reminder_max)
  on organizations to authenticated;

insert into auth.users values
  ('00000000-0000-0000-0000-00000000000a'),
  ('00000000-0000-0000-0000-00000000000b');

create function pg_temp.expect(ok boolean, label text) returns void language plpgsql as $$
begin
  if not ok then raise exception 'FAIL: %', label; end if;
  raise notice 'ok - %', label;
end $$;

-- User A creates a laundry and works an order through to ready.
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select create_organization('Kappa 7', 'kappa7', 'Owner A') as org_a \gset

select pg_temp.expect((select first_number from reserve_order_codes(:'org_a', 5)) = 1001, 'reserve codes starts at 1001');
select pg_temp.expect((select first_number from reserve_order_codes(:'org_a', 5)) = 1006, 'second reservation does not overlap');

insert into customers (id, org_id, name, phone)
values ('11111111-1111-1111-1111-111111111111', :'org_a', 'Evans Okyere', '+233241184477');
insert into orders (id, org_id, customer_id, code, total)
values ('22222222-2222-2222-2222-222222222222', :'org_a', '11111111-1111-1111-1111-111111111111', 'VX-1001', 3600);
insert into payments (org_id, order_id, amount, method)
values (:'org_a', '22222222-2222-2222-2222-222222222222', 1000, 'momo');
update orders set stage = 'washing' where code = 'VX-1001';
update orders set stage = 'ready'   where code = 'VX-1001';

select pg_temp.expect((select amount_paid from orders where code = 'VX-1001') = 1000, 'payments sync amount_paid');
select pg_temp.expect((select ready_at is not null from orders where code = 'VX-1001'), 'ready_at set');
select pg_temp.expect((select count(*) from order_events) = 3, 'three timeline events');
select pg_temp.expect((select status from messages where channel = 'sms') = 'queued', 'ready SMS queued');
select pg_temp.expect((select status from messages where channel = 'whatsapp') = 'skipped', 'WhatsApp skipped when disabled');
select pg_temp.expect((select body from messages where channel = 'sms') like '%Balance: GHS 26.00.', 'SMS shows balance');

-- Owner cannot change billing columns.
\set ON_ERROR_STOP 0
update organizations set plan = 'business';
\set ON_ERROR_STOP 1
select pg_temp.expect((select plan from organizations) = 'trial', 'owner cannot self-upgrade plan');

-- User B (no membership) sees and changes nothing in A.
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select pg_temp.expect((select count(*) from orders) = 0, 'B cannot read orders');
select pg_temp.expect((select count(*) from customers) = 0, 'B cannot read customers');
select pg_temp.expect((select count(*) from messages) = 0, 'B cannot read messages');
\set ON_ERROR_STOP 0
insert into customers (org_id, name, phone) values (:'org_a', 'intruder', '+233200000000');
insert into storage.objects (bucket_id, name) values ('item-photos', :'org_a' || '/x.jpg');
insert into messages (org_id, customer_id, channel, kind, body, to_phone)
values (:'org_a', '11111111-1111-1111-1111-111111111111', 'sms', 'manual', 'spam', '+233241184477');
select reserve_order_codes(:'org_a', 5);
\set ON_ERROR_STOP 1
update orders set stage = 'delivered' where org_id = :'org_a';

reset role;
select pg_temp.expect((select count(*) from customers where name = 'intruder') = 0, 'B cannot insert customers into A');
select pg_temp.expect((select count(*) from storage.objects) = 0, 'B cannot upload photos into A');
select pg_temp.expect((select count(*) from messages where body = 'spam') = 0, 'B cannot queue messages for A');
select pg_temp.expect((select stage from orders) = 'ready', 'B cannot update A orders');
select pg_temp.expect((select next_order_number from organizations) = 1011, 'B cannot reserve A codes');

-- Public tracking.
select tracking_token as token from orders limit 1 \gset
set role anon;
select pg_temp.expect(get_tracking(:'token')->>'code' = 'VX-1001', 'anon can track with token');
select pg_temp.expect(get_tracking('wrong-token') is null, 'wrong token returns nothing');
reset role;

\echo ALL 0001 TESTS PASSED
