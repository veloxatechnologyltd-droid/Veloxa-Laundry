-- Stream order and message changes to other devices of the same laundry
-- (the board refreshes when a colleague moves an order). Realtime applies RLS,
-- so members only receive their own org's rows. Guarded so plain Postgres
-- (supabase/tests/run.sh) without the publication still migrates.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table orders, messages;
  end if;
end $$;
