-- The database, not the screen, decides what a request costs and who may change it.
-- Before this, any owner or provider could rewrite a request's price, status or stages
-- through the API; the app only hid the buttons.

-- A new request takes its price and time from the provider's published offer.
create or replace function public.guard_request_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
declare svc public.services%rowtype; os public.office_services%rowtype; admin boolean := coalesce(public.is_admin(), false);
begin
  if auth.uid() is null then return new; end if;            -- seeds and scheduled jobs
  select * into svc from public.services where id = new.service_id and active;
  if not found then raise exception 'service_not_available'; end if;
  if new.office_id is null then
    new.quoted_fee := svc.gov_fee; new.quoted_days := svc.self_days;
  else
    select * into os from public.office_services where office_id = new.office_id and service_id = new.service_id;
    if not found then raise exception 'provider_does_not_offer_service'; end if;
    if not exists (select 1 from public.offices o where o.id = new.office_id and o.active and (admin or not o.is_demo)) then
      raise exception 'provider_not_available';
    end if;
    new.quoted_fee := os.fee + svc.gov_fee; new.quoted_days := os.days;
  end if;
  new.status := 'new'; new.accepted_at := null; new.completed_at := null; new.final_fee := null; new.escalated_at := null;
  new.created_at := now();
  if not admin then new.is_demo := false; end if;
  return new;
end $$;
revoke all on function public.guard_request_insert() from public, anon, authenticated;
create trigger guard_request_insert before insert on public.requests
  for each row execute function public.guard_request_insert();

-- After that, each side may only make its own move:
-- the owner cancels, the provider accepts or declines. Everything else is fixed.
create or replace function public.guard_request_update() returns trigger
language plpgsql security definer set search_path = '' as $$
declare is_owner boolean; is_office boolean;
begin
  if pg_trigger_depth() > 1 or auth.uid() is null or public.is_admin() then return new; end if;
  if (new.company_id, new.owner_id, new.service_id, new.created_at, new.is_demo) is distinct from (old.company_id, old.owner_id, old.service_id, old.created_at, old.is_demo)
     or new.office_id is distinct from old.office_id or new.document_id is distinct from old.document_id
     or new.quoted_fee is distinct from old.quoted_fee or new.quoted_days is distinct from old.quoted_days
     or new.final_fee is distinct from old.final_fee or new.escalated_at is distinct from old.escalated_at
     or new.completed_at is distinct from old.completed_at then
    raise exception 'request_field_locked';
  end if;
  is_owner := old.owner_id = auth.uid();
  is_office := old.office_id is not null and old.office_id = public.my_office();
  if new.status is distinct from old.status then
    if is_office and old.status = 'new' and new.status = 'accepted' then
      new.accepted_at := now();
    elsif is_office and old.status = 'new' and new.status = 'cancelled' then
      null;
    elsif is_owner and new.status = 'cancelled'
      and (old.status = 'new' or (old.office_id is null and old.status in ('accepted', 'in_progress'))) then
      null;
    else
      raise exception 'request_status_change_not_allowed';
    end if;
  elsif new.accepted_at is distinct from old.accepted_at then
    raise exception 'request_field_locked';
  end if;
  return new;
end $$;
revoke all on function public.guard_request_update() from public, anon, authenticated;
create trigger guard_request_update before update on public.requests
  for each row execute function public.guard_request_update();

-- A stage is finished by whoever carries out the request, in order, and stamped by the server's clock.
create or replace function public.guard_stage_update() returns trigger
language plpgsql security definer set search_path = '' as $$
declare r public.requests%rowtype; doer boolean;
begin
  if pg_trigger_depth() > 1 or auth.uid() is null or public.is_admin() then return new; end if;
  if (new.request_id, new.idx, new.title, new.planned_days) is distinct from (old.request_id, old.idx, old.title, old.planned_days) then
    raise exception 'stage_field_locked';
  end if;
  select * into r from public.requests where id = old.request_id;
  doer := case when r.office_id is null then r.owner_id = auth.uid() and r.status in ('new', 'accepted', 'in_progress')
               else r.office_id = public.my_office() and r.status in ('accepted', 'in_progress') end;
  if not coalesce(doer, false) then raise exception 'stage_not_yours'; end if;
  if old.done_at is not null then raise exception 'stage_already_done'; end if;
  if exists (select 1 from public.request_stages s where s.request_id = old.request_id and s.idx < old.idx and s.done_at is null) then
    raise exception 'stage_out_of_order';
  end if;
  new.started_at := coalesce(old.started_at, case when new.started_at is not null or new.done_at is not null then now() end);
  new.done_at := case when new.done_at is not null then now() end;
  return new;
end $$;
revoke all on function public.guard_stage_update() from public, anon, authenticated;
create trigger guard_stage_update before update on public.request_stages
  for each row execute function public.guard_stage_update();

-- Activity entries: each side may only log its own kind of entry. The rest are written by the database.
drop policy events_insert on public.events;
create policy events_insert on public.events for insert to authenticated with check (
  actor_id = (select auth.uid()) and (select public.can_see_request(request_id)) and (
    kind in ('note', 'file')
    or (select public.is_admin())
    or (kind in ('accepted', 'declined') and exists (select 1 from public.requests r where r.id = request_id and r.office_id = (select public.my_office())))
    or (kind in ('cancelled', 'rated') and exists (select 1 from public.requests r where r.id = request_id and r.owner_id = (select auth.uid())))
  ));

-- Reading a request is decided from its own columns. The old rule asked a helper to look the
-- row up again, which cannot see a row in the statement that inserts it, so a new request
-- could not be returned to the owner who had just created it.
drop policy requests_read on public.requests;
create policy requests_read on public.requests for select to authenticated using (
  owner_id = (select auth.uid())
  or (office_id is not null and office_id = (select public.my_office()))
  or (select public.is_admin()));
