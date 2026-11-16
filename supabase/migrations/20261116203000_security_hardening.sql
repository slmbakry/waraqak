-- Security hardening after the 16 Nov 2026 review (database and code).
-- Additive and "create or replace" only: nothing is dropped.

-- 1. Invitation-only, enforced here and not only by the sign-in screen.
--    An account is created only for an email with a live invitation; an
--    invitation is used once, lasts 7 days, and never grants the admin role.
alter table public.invites add column if not exists expires_at timestamptz not null default now() + interval '7 days';

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare inv public.invites%rowtype;
begin
  select * into inv from public.invites
   where lower(email) = lower(new.email) and accepted_at is null and expires_at > now() and role <> 'admin';
  if not found then raise exception 'not_invited'; end if;
  insert into public.profiles (id, email, role, office_id) values (new.id, new.email, inv.role, inv.office_id);
  update public.invites set accepted_at = now() where email = inv.email;
  return new;
end $$;

-- An invitation for someone who already has an account applies at once. The
-- match is on the sign-in email (auth.users), never on profiles.email.
create or replace function public.handle_new_invite() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.role = 'admin' then raise exception 'admin_not_invitable'; end if;
  new.expires_at := now() + interval '7 days';
  update public.profiles p set role = new.role, office_id = new.office_id
    from auth.users u
   where u.id = p.id and lower(u.email) = lower(new.email) and p.role is null;
  if found then new.accepted_at := now(); end if;
  return new;
end $$;

-- A person cannot change the email on their own profile row.
create or replace function public.guard_profile_update() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or public.is_admin() then return new; end if;
  if new.email is distinct from old.email then raise exception 'profile_field_locked'; end if;
  return new;
end $$;
revoke all on function public.guard_profile_update() from public, anon, authenticated;
create or replace trigger guard_profile_update before update on public.profiles
  for each row execute function public.guard_profile_update();

-- 2. What a provider sees of a company.
--    The company row: while a request between them is not cancelled.
--    Documents: only the document the request is about, while the request is
--    live and for 30 days after it is done.
create or replace function public.office_has_company(cid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.requests r
    where r.company_id = cid and r.office_id is not null
      and r.office_id = (select office_id from public.profiles where id = auth.uid())
      and r.status in ('new', 'accepted', 'in_progress', 'done')
  )
$$;

create or replace function public.office_has_document(did uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.requests r
    where r.document_id = did and r.office_id is not null
      and r.office_id = (select office_id from public.profiles where id = auth.uid())
      and (r.status in ('new', 'accepted', 'in_progress')
           or (r.status = 'done' and r.completed_at > now() - interval '30 days'))
  )
$$;
revoke all on function public.office_has_document(uuid) from public, anon;
grant execute on function public.office_has_document(uuid) to authenticated;

alter policy documents_office on public.documents
  using ((select public.office_has_document(documents.id)));
alter policy documents_office_insert on public.documents
  with check (false);

-- 3. Ratings: a provider reads its own, an owner their own, admins all.
--    Everyone with a role reads averages only, through office_ratings().
create or replace function public.office_ratings()
returns table(office_id uuid, professionalism numeric, speed numeric, n integer)
language sql stable security definer set search_path = '' as $$
  select r.office_id, round(avg(r.professionalism), 2), round(avg(r.speed), 2), count(*)::int
  from public.ratings r
  where (select public.my_role()) is not null
  group by r.office_id
$$;
revoke all on function public.office_ratings() from public, anon;
grant execute on function public.office_ratings() to authenticated;

alter policy ratings_read on public.ratings
  using (owner_id = (select auth.uid())
      or (office_id is not null and office_id = (select public.my_office()))
      or (select public.is_admin()));

-- 4. Delivery proof: the last stage closes only when a real file from the
--    provider is in the request's folder, not merely a "file" event.
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
     and not exists (select 1 from storage.objects o join public.profiles p on p.id::text = o.owner_id
                     where o.bucket_id = 'files' and o.name like 'requests/' || r.id::text || '/%' and p.office_id = r.office_id) then
    raise exception 'delivery_file_required';
  end if;
  new.started_at := coalesce(old.started_at, case when new.started_at is not null or new.done_at is not null then now() end);
  new.done_at := case when new.done_at is not null then now() end;
  return new;
end $$;

-- 5. Helper lists answer only people who have a role.
create or replace function public.place_names(p_kind text) returns setof text
language sql stable security definer set search_path = '' as $$
  select distinct n from (
    select case p_kind when 'registry' then registry_office when 'tax_office' then tax_office end n from public.companies
    union all
    select v.place from public.requirement_votes v join public.requirement_items i on i.id = v.item_id
      join public.services s on s.id = i.service_id where s.place_kind = p_kind
  ) x where n is not null and n <> '' and (select public.my_role()) is not null order by 1;
$$;

create or replace function public.requirement_stats(p_service text, p_place text default null)
returns table(item_id uuid, text text, providers integer, owners integer, total integer, providers_here integer, owners_here integer, total_here integer, last_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select i.id, i.text,
    count(distinct v.voter_id) filter (where v.voter_kind = 'provider')::int,
    count(distinct v.voter_id) filter (where v.voter_kind = 'owner')::int,
    count(distinct v.voter_id)::int,
    count(distinct v.voter_id) filter (where v.voter_kind = 'provider' and v.place = p_place)::int,
    count(distinct v.voter_id) filter (where v.voter_kind = 'owner' and v.place = p_place)::int,
    count(distinct v.voter_id) filter (where v.place = p_place)::int,
    max(v.created_at)
  from public.requirement_items i
  left join public.requirement_votes v on v.item_id = i.id
  where i.service_id = p_service and i.status = 'approved' and (select public.my_role()) is not null
  group by i.id, i.text
  order by 8 desc, 5 desc, i.created_at;
$$;

-- 6. Share links last 7 days; the owner extends or renews them.
alter table public.company_shares add column if not exists expires_at timestamptz not null default now() + interval '7 days';

create or replace function public.renew_share_token(sid uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare t text := replace(replace(replace(encode(extensions.gen_random_bytes(18), 'base64'), '/', '_'), '+', '-'), '=', '');
begin
  update public.company_shares set token = t, expires_at = now() + interval '7 days' where id = sid and public.owns_company(company_id);
  if not found then raise exception 'not_found'; end if;
  return t;
end $$;
