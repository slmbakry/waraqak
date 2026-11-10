-- Provider profiles, and contact details that stay out of reach until there is an agreement.
-- A provider's phone moves to its own table that an owner can read only once a request with
-- that provider has been accepted; a provider can read an owner's email on the same condition.
alter table public.offices
  add column areas text[] not null default '{}',     -- governorates the provider covers; empty means all
  add column verified boolean not null default false;
update public.offices set verified = true where license_no is not null;

create table public.office_contacts (
  office_id uuid primary key references public.offices(id) on delete cascade,
  phone text check (phone is null or length(phone) <= 30)
);
insert into public.office_contacts (office_id, phone) select id, phone from public.offices where phone is not null;
update public.offices set phone = null where phone is not null;      -- the old column is no longer read
alter table public.office_contacts enable row level security;
create policy office_contacts_read on public.office_contacts for select to authenticated using (
  (select public.is_admin()) or office_id = (select public.my_office())
  or exists (select 1 from public.requests r where r.office_id = office_contacts.office_id and r.owner_id = (select auth.uid())
             and r.status in ('accepted', 'in_progress', 'done')));
create policy office_contacts_insert on public.office_contacts for insert to authenticated
  with check ((select public.is_admin()) or office_id = (select public.my_office()));
create policy office_contacts_update on public.office_contacts for update to authenticated
  using ((select public.is_admin()) or office_id = (select public.my_office()))
  with check ((select public.is_admin()) or office_id = (select public.my_office()));

-- A provider edits its own introduction and coverage. Its name, licence and verification are the admin's.
create policy offices_self on public.offices for update to authenticated
  using (id = (select public.my_office())) with check (id = (select public.my_office()));
create or replace function public.guard_office_update() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or public.is_admin() then return new; end if;
  if (to_jsonb(new) - 'about' - 'areas') is distinct from (to_jsonb(old) - 'about' - 'areas') then
    raise exception 'office_field_locked';
  end if;
  if length(coalesce(new.about, '')) > 600 then raise exception 'about_too_long'; end if;
  return new;
end $$;
revoke all on function public.guard_office_update() from public, anon, authenticated;
create trigger guard_office_update before update on public.offices
  for each row execute function public.guard_office_update();

alter policy profiles_office_read on public.profiles using (
  exists (select 1 from public.requests r where r.owner_id = profiles.id and r.office_id is not null
          and r.office_id = (select public.my_office()) and r.status in ('accepted', 'in_progress', 'done')));
