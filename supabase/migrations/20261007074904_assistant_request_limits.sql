begin;
-- Quota metadata only; never questions or answers.
create table public.assistant_requests (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 created_at timestamptz not null default now()
);
create index assistant_requests_user_time_idx on public.assistant_requests(user_id,created_at desc);
alter table public.assistant_requests enable row level security;
revoke all on public.assistant_requests from public,anon,authenticated;
grant select,insert on public.assistant_requests to authenticated;
grant all on public.assistant_requests to service_role;
create policy "Caller reads own assistant quota" on public.assistant_requests for select to authenticated using (user_id=(select auth.uid()));
create policy "Caller consumes own assistant quota" on public.assistant_requests for insert to authenticated with check (user_id=(select auth.uid()));
create policy "Gesperrte Konten ausgeschlossen" on public.assistant_requests as restrictive for all to authenticated
 using ((select app_private.is_account_active())) with check ((select app_private.is_account_active()));
create function public.validate_assistant_request() returns trigger language plpgsql security invoker set search_path='' as $$
declare n_minute bigint; n_day bigint;
begin
 if auth.uid() is null or new.user_id is distinct from auth.uid() then raise exception 'Kein Zugriff auf dieses KI-Kontingent.'; end if;
 perform pg_advisory_xact_lock(hashtextextended('assistant:'||auth.uid()::text,0));
 new.created_at:=clock_timestamp();
 select count(*) filter(where r.created_at>new.created_at-interval '1 minute'),count(*) into n_minute,n_day
 from public.assistant_requests r where r.user_id=auth.uid() and r.created_at>new.created_at-interval '24 hours';
 if n_minute>=8 or n_day>=80 then raise exception 'KI-Limit erreicht. Bitte später erneut versuchen.'; end if;
 return new;
end;
$$;
revoke all on function public.validate_assistant_request() from public,anon,authenticated;
create trigger assistant_request_validation before insert on public.assistant_requests for each row execute function public.validate_assistant_request();
commit;
