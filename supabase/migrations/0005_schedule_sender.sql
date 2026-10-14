-- ---------------------------------------------------------------------------
-- 0005: call the send-messages Edge Function every minute.
-- The URL and shared secret live in Supabase Vault (set once per project, see
-- docs/MESSAGING.md "Deploying"). Until both exist this does nothing, so it is
-- safe on local/staging. Skips the HTTP call when nothing is waiting to send.
-- Only created where pg_cron, pg_net and Vault are available (Supabase).
-- ---------------------------------------------------------------------------

do $outer$
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_net')
     or not exists (select 1 from pg_namespace where nspname = 'vault')
     or not exists (select 1 from pg_namespace where nspname = 'cron') then
    raise notice 'pg_net/vault/pg_cron not available; send-messages schedule not created';
    return;
  end if;

  create extension if not exists pg_net;

  execute $fn$
    create function public.invoke_sender() returns void
    language plpgsql security definer set search_path = public as $body$
    declare
      fn_url text;
      fn_secret text;
    begin
      select decrypted_secret into fn_url    from vault.decrypted_secrets where name = 'send_messages_url';
      select decrypted_secret into fn_secret from vault.decrypted_secrets where name = 'send_messages_secret';
      if fn_url is null or fn_secret is null then return; end if;
      if not exists (select 1 from messages where channel = 'sms' and status in ('queued', 'sending')) then return; end if;
      perform net.http_post(
        url     := fn_url,
        headers := jsonb_build_object('Authorization', 'Bearer ' || fn_secret, 'Content-Type', 'application/json'),
        body    := '{}'::jsonb,
        timeout_milliseconds := 30000);
    end $body$;
  $fn$;

  revoke execute on function public.invoke_sender() from public, anon, authenticated;
  perform cron.schedule('send-messages', '* * * * *', 'select public.invoke_sender()');
end $outer$;
