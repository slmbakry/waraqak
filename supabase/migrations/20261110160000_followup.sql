-- Follow-up tools: the owner's phone under the same late-reveal rule as the provider's,
-- extending a stage with a stated reason, proof before delivery, and complaints.

-- ---------- Owner contact ----------
create table public.owner_contacts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  phone text check (phone is null or length(phone) <= 30)
);
alter table public.owner_contacts enable row level security;
create policy owner_contacts_read on public.owner_contacts for select to authenticated using (
  user_id = (select auth.uid()) or (select public.is_admin())
  or exists (select 1 from public.requests r where r.owner_id = owner_contacts.user_id and r.office_id is not null
             and r.office_id = (select public.my_office()) and r.status in ('accepted', 'in_progress', 'done')));
create policy owner_contacts_insert on public.owner_contacts for insert to authenticated with check (user_id = (select auth.uid()));
create policy owner_contacts_update on public.owner_contacts for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
-- A provider no longer reads an owner's profile at all: the email is a sign-in detail, not a contact.
alter policy profiles_office_read on public.profiles using (false);

-- ---------- Extending a stage ----------
-- The provider adds days to the stage in progress and says why. The promised total stays as
-- it was, so on-time figures still measure against the original promise.
create or replace function public.extend_stage(p_stage uuid, p_days int, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare st public.request_stages%rowtype; r public.requests%rowtype; svc text;
begin
  if p_days is null or p_days < 1 or p_days > 30 then raise exception 'bad_days'; end if;
  if length(trim(coalesce(p_reason, ''))) < 5 then raise exception 'reason_required'; end if;
  select * into st from public.request_stages where id = p_stage;
  if not found then raise exception 'stage_not_found'; end if;
  select * into r from public.requests where id = st.request_id;
  if not (public.is_admin() or (r.office_id is not null and r.office_id = public.my_office())) then raise exception 'stage_not_yours'; end if;
  if r.status not in ('accepted', 'in_progress') or st.done_at is not null
     or exists (select 1 from public.request_stages s where s.request_id = st.request_id and s.idx < st.idx and s.done_at is null) then
    raise exception 'stage_not_current';
  end if;
  perform set_config('waraqak.internal', '1', true);
  update public.request_stages set planned_days = planned_days + p_days where id = p_stage;
  perform set_config('waraqak.internal', '', true);
  insert into public.events (request_id, actor_id, kind, note) values (r.id, auth.uid(), 'extended', p_days || '|' || left(trim(p_reason), 500));
  select title into svc from public.services where id = r.service_id;
  perform public.notify(r.owner_id, null, false, 'extended', 'مدّد مقدم الخدمة موعد مرحلة: ' || st.title, svc || ' · ' || left(trim(p_reason), 120), '#request/' || r.id, null);
end $$;
revoke all on function public.extend_stage(uuid, int, text) from public, anon;
grant execute on function public.extend_stage(uuid, int, text) to authenticated;

-- ---------- Proof before delivery ----------
-- A provider closes the last stage only after uploading at least one file to the request.
create or replace function public.guard_stage_update() returns trigger
language plpgsql security definer set search_path = '' as $$
declare r public.requests%rowtype; doer boolean;
begin
  if pg_trigger_depth() > 1 or auth.uid() is null or public.is_admin() or current_setting('waraqak.internal', true) = '1' then return new; end if;
  if (new.request_id, new.idx, new.title, new.planned_days) is distinct from (old.request_id, old.idx, old.title, old.planned_days) then
    raise exception 'stage_field_locked';
  end if;
  select * into r from public.requests where id = old.request_id;
  doer := case when r.office_id is not null then r.office_id = public.my_office() and r.status in ('accepted', 'in_progress')
               when r.mode = 'procedure' then r.owner_id = auth.uid() and r.status in ('new', 'accepted', 'in_progress')
               else false end;
  if not coalesce(doer, false) then raise exception 'stage_not_yours'; end if;
  if old.done_at is not null then raise exception 'stage_already_done'; end if;
  if exists (select 1 from public.request_stages s where s.request_id = old.request_id and s.idx < old.idx and s.done_at is null) then
    raise exception 'stage_out_of_order';
  end if;
  if new.done_at is not null and r.office_id is not null
     and not exists (select 1 from public.request_stages s where s.request_id = old.request_id and s.idx > old.idx)
     and not exists (select 1 from public.events e join public.profiles p on p.id = e.actor_id
                     where e.request_id = r.id and e.kind = 'file' and p.office_id = r.office_id) then
    raise exception 'delivery_file_required';
  end if;
  new.started_at := coalesce(old.started_at, case when new.started_at is not null or new.done_at is not null then now() end);
  new.done_at := case when new.done_at is not null then now() end;
  return new;
end $$;

-- ---------- Complaints ----------
create table public.disputes (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.requests(id) on delete cascade,
  opened_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  reason text not null check (length(reason) between 10 and 2000),
  status text not null default 'open' check (status in ('open', 'resolved')),
  resolution text check (resolution is null or length(resolution) <= 2000),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create unique index disputes_one_open on public.disputes(request_id) where status = 'open';
alter table public.disputes enable row level security;
create policy disputes_read on public.disputes for select to authenticated using ((select public.can_see_request(request_id)));
create policy disputes_insert on public.disputes for insert to authenticated with check (
  opened_by = (select auth.uid()) and status = 'open' and resolution is null and resolved_at is null
  and exists (select 1 from public.requests r where r.id = request_id and r.owner_id = (select auth.uid())
              and r.office_id is not null and r.status in ('accepted', 'in_progress', 'done')));
create policy disputes_admin on public.disputes for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

create or replace function public.handle_dispute() returns trigger
language plpgsql security definer set search_path = '' as $$
declare r public.requests%rowtype; svc text; co text;
begin
  select * into r from public.requests where id = new.request_id;
  select title into svc from public.services where id = r.service_id;
  select name into co from public.companies where id = r.company_id;
  if tg_op = 'INSERT' then
    update public.requests set escalated_at = coalesce(escalated_at, now()) where id = r.id;
    perform public.notify(null, null, true, 'dispute', 'شكوى على طلب', svc || ' · ' || co, '#request/' || r.id, 'dispute:' || new.id);
    perform public.notify(null, r.office_id, false, 'dispute', 'فتح صاحب العمل شكوى على طلب', svc || ' · الإدارة تراجعها', '#job/' || r.id, 'dispute-office:' || new.id);
  elsif new.status = 'resolved' and old.status = 'open' then
    new.resolved_at := now();
    perform public.notify(r.owner_id, null, false, 'dispute_done', 'ردّت الإدارة على شكواك', svc || coalesce(' · ' || left(new.resolution, 120), ''), '#request/' || r.id, 'dispute-done:' || new.id);
    perform public.notify(null, r.office_id, false, 'dispute_done', 'أُغلقت الشكوى على طلب', svc || coalesce(' · ' || left(new.resolution, 120), ''), '#job/' || r.id, 'dispute-done-office:' || new.id);
  end if;
  return new;
end $$;
revoke all on function public.handle_dispute() from public, anon, authenticated;
create trigger on_dispute_new after insert on public.disputes for each row execute function public.handle_dispute();
create trigger on_dispute_resolved before update of status on public.disputes for each row execute function public.handle_dispute();
