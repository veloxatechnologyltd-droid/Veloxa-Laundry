-- create_order, single "ready" SMS, invites, scheduled reminders.
-- Runs after 10_rls_and_triggers.sql (org A "Kappa 7" with owner A exists).
\set ON_ERROR_STOP 1

grant all on all tables in schema public to authenticated;

create function pg_temp.expect(ok boolean, label text) returns void language plpgsql as $$
begin
  if not ok then raise exception 'FAIL: %', label; end if;
  raise notice 'ok - %', label;
end $$;

insert into auth.users values
  ('00000000-0000-0000-0000-00000000000c'),
  ('00000000-0000-0000-0000-00000000000d');

select id as org_a from organizations where slug = 'kappa7' \gset
select id as svc_dry  from services where org_id = :'org_a' and label = 'Dry Clean' \gset
select id as svc_iron from services where org_id = :'org_a' and label = 'Wash & Iron' \gset

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';

-- --- create_order ------------------------------------------------------------
select create_order(
  jsonb_build_object('id', '33333333-3333-3333-3333-333333333333', 'org_id', :'org_a',
    'customer_id', '11111111-1111-1111-1111-111111111111', 'code', 'VX-1002', 'express', true),
  jsonb_build_array(
    jsonb_build_object('id', gen_random_uuid(), 'tag', 'VX-1002-01', 'type', 'Kente', 'service_id', :'svc_dry', 'qty', 1, 'flag', 'delicate'),
    jsonb_build_object('id', gen_random_uuid(), 'tag', 'VX-1002-02', 'type', 'Shirt', 'service_id', :'svc_iron', 'qty', 2, 'unit_price', 1)));
-- (2500 + 2*1200) * 1.5 = 7350; the client-sent unit_price of 1 is ignored.
select pg_temp.expect((select total from orders where code = 'VX-1002') = 7350, 'create_order prices from the price list, express +50%');
select pg_temp.expect((select count(*) from order_items where tag like 'VX-1002-%') = 2, 'create_order inserts items');
select pg_temp.expect((select count(*) from order_events e join orders o on o.id = e.order_id where o.code = 'VX-1002') = 1, 'create_order logs received');

select create_order(jsonb_build_object('id', '33333333-3333-3333-3333-333333333333', 'org_id', :'org_a',
  'customer_id', '11111111-1111-1111-1111-111111111111', 'code', 'VX-1002'), '[]');
select pg_temp.expect((select count(*) from orders where code = 'VX-1002') = 1, 'create_order replay is a no-op');

-- A failing item leaves no half-created order.
\set ON_ERROR_STOP 0
select create_order(
  jsonb_build_object('id', '44444444-4444-4444-4444-444444444444', 'org_id', :'org_a',
    'customer_id', '11111111-1111-1111-1111-111111111111', 'code', 'VX-1003'),
  jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'tag', 'VX-1002-01', 'type', 'Dup tag', 'qty', 1)));
select create_order(
  jsonb_build_object('id', '44444444-4444-4444-4444-444444444444', 'org_id', :'org_a',
    'customer_id', '11111111-1111-1111-1111-111111111111', 'code', 'VX-1003'), '[]');
\set ON_ERROR_STOP 1
select pg_temp.expect((select count(*) from orders where code = 'VX-1003') = 0, 'failed item rolls back the order; empty orders rejected');

-- --- ready SMS only once -------------------------------------------------------
update orders set stage = 'ready'   where code = 'VX-1002';
update orders set stage = 'ironing' where code = 'VX-1002';
update orders set stage = 'ready'   where code = 'VX-1002';
select pg_temp.expect((select count(*) from messages m join orders o on o.id = m.order_id
  where o.code = 'VX-1002' and m.channel = 'sms') = 1, 'ready SMS sent once even after moving back');

-- --- reminders -------------------------------------------------------------------
reset role;
-- Fixed daytime clock so the night-time hold (0004) never makes this flaky.
select date_trunc('day', now()) + interval '12 hours' as noon \gset
update orders set ready_at = :'noon'::timestamptz - interval '25 hours' where code = 'VX-1002';
select pg_temp.expect(queue_due_reminders(:'noon') >= 1, 'reminder queued after reminder_after');
select pg_temp.expect((select reminders_sent from orders where code = 'VX-1002') = 1, 'reminders_sent counted');
select pg_temp.expect(queue_due_reminders(:'noon') = 0, 'no second reminder before another reminder_after');
update orders set last_reminder_at = :'noon'::timestamptz - interval '25 hours' where code = 'VX-1002';
update orders set reminders_sent = 3 where code = 'VX-1002';
select pg_temp.expect(queue_due_reminders(:'noon') = 0, 'stops at reminder_max');
select pg_temp.expect((select body from messages where kind = 'reminder' limit 1) like 'Kappa 7: Reminder, VX-1002 is ready for pickup. Balance: GHS 73.50.',
  'reminder wording');
select pg_temp.expect((select length(body) from messages where kind = 'reminder' limit 1) <= 160, 'reminder fits one SMS');

set role authenticated;
\set ON_ERROR_STOP 0
select queue_due_reminders();
\set ON_ERROR_STOP 1
reset role;
select pg_temp.expect((select count(*) from messages where kind = 'reminder') = 1, 'app users cannot run the reminder job');

-- --- invites -------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
insert into invites (org_id, email, role, display_name, invited_by)
values (:'org_a', 'kwesi@example.com', 'staff', 'Kwesi', '00000000-0000-0000-0000-00000000000a');
select id as invite from invites \gset

-- User C signs in with a different email: sees nothing, cannot accept.
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
set request.jwt.claims = '{"email": "someone@example.com"}';
select pg_temp.expect((select count(*) from my_invites()) = 0, 'other email sees no invite');
select pg_temp.expect((select count(*) from invites) = 0, 'non-owner cannot read invites');
\set ON_ERROR_STOP 0
select accept_invite(:'invite');
insert into invites (org_id, email, role, display_name) values (:'org_a', 'me@example.com', 'owner', 'Me');
\set ON_ERROR_STOP 1
select pg_temp.expect((select count(*) from orders) = 0, 'wrong email did not join');

-- User D signs in with the invited email (any case): accepts and becomes staff.
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000d';
set request.jwt.claims = '{"email": "Kwesi@Example.com"}';
select pg_temp.expect((select org_name from my_invites()) = 'Kappa 7', 'invitee sees the invite');
select pg_temp.expect(accept_invite(:'invite') = :'org_a'::uuid, 'invitee accepts');
select pg_temp.expect((select role from memberships where user_id = auth.uid()) = 'staff', 'invitee is staff');
select pg_temp.expect((select count(*) from orders) > 0, 'staff can now read orders');
select pg_temp.expect((select count(*) from my_invites()) = 0, 'accepted invite is gone');
\set ON_ERROR_STOP 0
insert into invites (org_id, email, display_name) values (:'org_a', 'friend@example.com', 'Friend');
update memberships set role = 'owner' where user_id = auth.uid();
\set ON_ERROR_STOP 1
reset role;
select pg_temp.expect((select count(*) from invites where email = 'friend@example.com') = 0, 'staff cannot invite');
select pg_temp.expect((select role from memberships where user_id = '00000000-0000-0000-0000-00000000000d') = 'staff', 'staff cannot promote themselves');

\echo ALL 0003 TESTS PASSED
