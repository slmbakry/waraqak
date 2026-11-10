-- Accuracy: every service says where its facts come from, when they were last checked and how
-- sure we are; every change to those facts is logged; and anyone can report an error on the
-- exact item, which lands in a review queue.

alter table public.services
  add column sources jsonb not null default '[]',        -- [{"title": "...", "url": "..."}]
  add column confidence text not null default 'unverified' check (confidence in ('confirmed', 'likely', 'unverified')),
  add column reviewed_at date,
  add column review_note text;

create table public.service_changes (
  id bigint generated always as identity primary key,
  service_id text not null references public.services(id) on delete cascade,
  field text not null,
  old jsonb,
  new jsonb,
  changed_by uuid references auth.users(id) on delete set null,
  changed_at timestamptz not null default now()
);
create index on public.service_changes(service_id, changed_at desc);
alter table public.service_changes enable row level security;
create policy service_changes_admin on public.service_changes for select to authenticated using ((select public.is_admin()));
revoke insert, update, delete on public.service_changes from anon, authenticated;

create or replace function public.log_service_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare f text; o jsonb := to_jsonb(old); n jsonb := to_jsonb(new);
begin
  foreach f in array array['title', 'agency', 'gov_fee', 'self_days', 'validity_days', 'docs', 'stages', 'sources', 'confidence', 'reviewed_at', 'mode', 'category_id', 'active'] loop
    if o -> f is distinct from n -> f then
      insert into public.service_changes (service_id, field, old, new, changed_by) values (new.id, f, o -> f, n -> f, auth.uid());
    end if;
  end loop;
  return new;
end $$;
revoke all on function public.log_service_change() from public, anon, authenticated;
create trigger on_service_change after update on public.services
  for each row execute function public.log_service_change();

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  role text,
  kind text not null check (kind in ('service', 'path', 'activity', 'obligation', 'registry', 'other')),
  ref text not null check (length(ref) <= 120),
  label text not null check (length(label) <= 200),
  body text not null check (length(body) between 3 and 2000),
  page text,
  status text not null default 'open' check (status in ('open', 'fixed', 'rejected')),
  reply text check (reply is null or length(reply) <= 1000),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index on public.reports(status, created_at desc);
alter table public.reports enable row level security;
create policy reports_insert on public.reports for insert to authenticated
  with check (user_id = (select auth.uid()) and status = 'open' and reply is null and resolved_at is null and (select public.my_role()) is not null);
create policy reports_read on public.reports for select to authenticated using (user_id = (select auth.uid()) or (select public.is_admin()));
create policy reports_admin on public.reports for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

create or replace function public.handle_report() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    perform public.notify(null, null, true, 'report', 'بلاغ عن خطأ: ' || new.label, left(new.body, 140), '/admin/accuracy', 'report:' || new.id);
  elsif new.status <> old.status and new.status <> 'open' then
    new.resolved_at := now();
    perform public.notify(new.user_id, null, false, 'report_done',
      case new.status when 'fixed' then 'صححنا ما بلّغت عنه' else 'راجعنا بلاغك' end,
      new.label || coalesce(' · ' || new.reply, ''), '/alerts', 'report-done:' || new.id);
  end if;
  return new;
end $$;
revoke all on function public.handle_report() from public, anon, authenticated;
create trigger on_report_new after insert on public.reports for each row execute function public.handle_report();
create trigger on_report_resolved before update of status on public.reports for each row execute function public.handle_report();
