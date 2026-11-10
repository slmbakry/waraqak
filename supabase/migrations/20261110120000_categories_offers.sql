-- Sections, two kinds of service, offers and agreements.
-- A new line of business becomes rows, not code: a section, its services, the questions each
-- service asks, and providers who cover the section. Services are either a procedure with a
-- published price, or a request for offers that ends in an agreement on stated terms.

-- ---------- Sections ----------
create table public.categories (
  id text primary key check (id ~ '^[a-z0-9_]+$'),
  title text not null,
  summary text,
  icon text not null default 'doc',
  sort int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.categories enable row level security;
create policy categories_read on public.categories for select to authenticated
  using ((select public.my_role()) is not null and (active or (select public.is_admin())));
create policy categories_admin on public.categories for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

insert into public.categories (id, title, summary, icon, sort) values
  ('founding', 'التأسيس', 'من الفكرة إلى شركة مسجلة', 'idea', 10),
  ('amendment', 'التعديلات', 'تغيير في رأس المال أو الشركاء أو الإدارة أو المقر أو النشاط', 'stamp', 20),
  ('renewal', 'التجديد', 'تجديد المستندات قبل انتهائها', 'calendar', 30),
  ('compliance', 'الالتزامات الدورية', 'الإقرارات والاجتماعات السنوية', 'clock', 40),
  ('license', 'التراخيص', 'تراخيص الأنشطة التي تحتاج موافقة جهة مختصة', 'shield', 50),
  ('closure', 'الإنهاء', 'تصفية الشركة وشطبها', 'doc', 60),
  ('professional', 'خدمات مهنية', 'خدمات مستمرة تتعاقد عليها بعرض وشروط', 'users', 70);

-- ---------- Services ----------
alter table public.services drop constraint services_kind_check;
alter table public.services
  add column category_id text references public.categories(id),
  add column mode text not null default 'procedure' check (mode in ('procedure', 'quote')),
  add column need_fields jsonb not null default '[]',
  add column summary text;
update public.services set category_id = kind;
alter table public.services alter column category_id set not null;
create index on public.services(category_id);

insert into public.services (id, title, kind, category_id, mode, agency, summary, docs, stages, gov_fee, self_days, validity_days, sort, need_fields) values
  ('bookkeeping', 'إمساك الدفاتر والمحاسبة الشهرية', 'professional', 'professional', 'quote', 'مقدم الخدمة',
   'محاسب يسجل قيود شركتك شهريًا ويجهز إقراراتها الدورية، بعقد سنوي.',
   '["صورة السجل التجاري", "صورة البطاقة الضريبية", "كشوف الحساب البنكي لآخر ثلاثة أشهر"]',
   '[{"title": "استلام المستندات وفتح الملف", "days": 3}, {"title": "بدء الخدمة الشهرية", "days": 4}]', 0, 0, 365, 10,
   '[{"id": "invoices", "label": "عدد الفواتير شهريًا تقريبًا", "type": "number", "required": true},
     {"id": "employees", "label": "عدد الموظفين", "type": "number", "required": true},
     {"id": "vat", "label": "هل الشركة مسجلة في ضريبة القيمة المضافة؟", "type": "select", "options": ["نعم", "لا"], "required": true},
     {"id": "notes", "label": "ملاحظات تريد أن يعرفها مقدم الخدمة", "type": "text", "required": false}]'),
  ('annual_audit', 'مراجعة الحسابات وإعداد القوائم المالية السنوية', 'professional', 'professional', 'quote', 'مقدم الخدمة',
   'مراقب حسابات يراجع دفاتر السنة ويعد القوائم المالية وتقريره عنها.',
   '["صورة السجل التجاري", "صورة البطاقة الضريبية", "ميزان المراجعة ودفاتر السنة", "كشوف الحسابات البنكية عن السنة"]',
   '[{"title": "استلام الدفاتر والمستندات", "days": 5}, {"title": "المراجعة", "days": 15}, {"title": "تسليم القوائم المالية والتقرير", "days": 5}]', 0, 0, null, 20,
   '[{"id": "year", "label": "السنة المالية المطلوب مراجعتها", "type": "text", "required": true},
     {"id": "revenue", "label": "حجم الإيرادات السنوية تقريبًا بالجنيه", "type": "number", "required": true},
     {"id": "books", "label": "هل الدفاتر مسجلة ومكتملة؟", "type": "select", "options": ["نعم", "جزئيًا", "لا"], "required": true},
     {"id": "notes", "label": "ملاحظات تريد أن يعرفها مقدم الخدمة", "type": "text", "required": false}]');

-- ---------- Providers ----------
alter table public.offices drop constraint offices_kind_check;
alter table public.offices add column about text;
create table public.office_categories (
  office_id uuid not null references public.offices(id) on delete cascade,
  category_id text not null references public.categories(id) on delete cascade,
  primary key (office_id, category_id)
);
create index on public.office_categories(category_id);
alter table public.office_categories enable row level security;
create policy oc_read on public.office_categories for select to authenticated using ((select public.my_role()) is not null);
create policy oc_office on public.office_categories for all to authenticated
  using (office_id = (select public.my_office()) or (select public.is_admin()))
  with check (office_id = (select public.my_office()) or (select public.is_admin()));
insert into public.office_categories (office_id, category_id)
  select distinct os.office_id, s.category_id from public.office_services os join public.services s on s.id = os.service_id
  union select id, 'professional' from public.offices;

-- ---------- Requests, offers, agreements ----------
alter table public.requests
  add column mode text not null default 'procedure' check (mode in ('procedure', 'quote')),
  add column need jsonb check (need is null or pg_column_size(need) < 8000);

create table public.offers (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.requests(id) on delete cascade,
  office_id uuid not null references public.offices(id) on delete cascade,
  fee numeric not null check (fee >= 0),
  days int not null check (days > 0),
  terms text check (terms is null or length(terms) <= 4000),
  valid_until date,
  status text not null default 'sent' check (status in ('sent', 'accepted', 'declined', 'withdrawn')),
  auto boolean not null default false,
  created_at timestamptz not null default now(),
  unique (request_id, office_id)
);
create index on public.offers(office_id);
alter table public.offers enable row level security;

create table public.agreements (
  request_id uuid primary key references public.requests(id) on delete cascade,
  offer_id uuid references public.offers(id) on delete set null,
  office_id uuid not null references public.offices(id),
  fee numeric not null,
  days int not null,
  terms text,
  agreed_at timestamptz not null default now(),
  expires_on date,
  document_id uuid references public.documents(id) on delete set null
);
create index on public.agreements(office_id);
alter table public.agreements enable row level security;
revoke insert, update, delete on public.agreements from anon, authenticated;

-- Which open requests for offers a provider may see: those in a section it covers, on its side of the demo line.
create or replace function public.office_can_quote(p_service text, p_demo boolean) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.services s
    join public.office_categories oc on oc.category_id = s.category_id
    join public.offices o on o.id = oc.office_id
    where s.id = p_service and oc.office_id = (select office_id from public.profiles where id = auth.uid())
      and o.active and o.is_demo = p_demo)
$$;
revoke all on function public.office_can_quote(text, boolean) from public, anon;
grant execute on function public.office_can_quote(text, boolean) to authenticated;

drop policy requests_read on public.requests;
create policy requests_read on public.requests for select to authenticated using (
  owner_id = (select auth.uid())
  or (office_id is not null and office_id = (select public.my_office()))
  or (select public.is_admin())
  or (mode = 'quote' and office_id is null and status = 'new' and public.office_can_quote(service_id, is_demo)));

create policy offers_read on public.offers for select to authenticated using (
  office_id = (select public.my_office()) or (select public.is_admin())
  or exists (select 1 from public.requests r where r.id = request_id and r.owner_id = (select auth.uid())));
create policy offers_insert on public.offers for insert to authenticated with check (
  status = 'sent' and not auto and (office_id = (select public.my_office()) or (select public.is_admin()))
  and exists (select 1 from public.requests r where r.id = request_id and r.mode = 'quote' and r.office_id is null and r.status = 'new'));
create policy offers_update on public.offers for update to authenticated
  using ((office_id = (select public.my_office()) and status = 'sent' and not auto) or (select public.is_admin()))
  with check ((office_id = (select public.my_office()) and status in ('sent', 'withdrawn') and not auto) or (select public.is_admin()));
create policy agreements_read on public.agreements for select to authenticated using (
  office_id = (select public.my_office()) or (select public.is_admin())
  or exists (select 1 from public.requests r where r.id = request_id and r.owner_id = (select auth.uid())));

-- ---------- Rules ----------
create or replace function public.guard_request_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
declare svc public.services%rowtype; os public.office_services%rowtype; admin boolean := coalesce(public.is_admin(), false);
begin
  if auth.uid() is null then return new; end if;            -- seeds and scheduled jobs
  select * into svc from public.services where id = new.service_id and active;
  if not found then raise exception 'service_not_available'; end if;
  new.mode := svc.mode;
  if svc.mode = 'quote' then
    new.office_id := null; new.quoted_fee := null; new.quoted_days := null;
  elsif new.office_id is null then
    new.quoted_fee := svc.gov_fee; new.quoted_days := svc.self_days; new.need := null;
  else
    select * into os from public.office_services where office_id = new.office_id and service_id = new.service_id;
    if not found then raise exception 'provider_does_not_offer_service'; end if;
    if not exists (select 1 from public.offices o where o.id = new.office_id and o.active and (admin or not o.is_demo)) then
      raise exception 'provider_not_available';
    end if;
    new.quoted_fee := os.fee + svc.gov_fee; new.quoted_days := os.days; new.need := null;
  end if;
  new.status := 'new'; new.accepted_at := null; new.completed_at := null; new.final_fee := null; new.escalated_at := null;
  new.created_at := now();
  if not admin then new.is_demo := false; end if;
  return new;
end $$;

create or replace function public.guard_request_update() returns trigger
language plpgsql security definer set search_path = '' as $$
declare is_owner boolean; is_office boolean;
begin
  if pg_trigger_depth() > 1 or auth.uid() is null or public.is_admin() or current_setting('waraqak.internal', true) = '1' then return new; end if;
  if (new.company_id, new.owner_id, new.service_id, new.created_at, new.is_demo, new.mode) is distinct from (old.company_id, old.owner_id, old.service_id, old.created_at, old.is_demo, old.mode)
     or new.office_id is distinct from old.office_id or new.document_id is distinct from old.document_id
     or new.quoted_fee is distinct from old.quoted_fee or new.quoted_days is distinct from old.quoted_days
     or new.final_fee is distinct from old.final_fee or new.escalated_at is distinct from old.escalated_at
     or new.completed_at is distinct from old.completed_at or new.need is distinct from old.need then
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
  new.started_at := coalesce(old.started_at, case when new.started_at is not null or new.done_at is not null then now() end);
  new.done_at := case when new.done_at is not null then now() end;
  return new;
end $$;

-- A procedure request carries the provider's published price as its offer.
-- A request for offers is announced to the providers who cover its section.
create or replace function public.handle_request_offers() returns trigger
language plpgsql security definer set search_path = '' as $$
declare svc public.services%rowtype; o record;
begin
  select * into svc from public.services where id = new.service_id;
  if new.mode = 'quote' then
    for o in select oc.office_id from public.office_categories oc join public.offices f on f.id = oc.office_id
        where oc.category_id = svc.category_id and f.active and f.is_demo = new.is_demo loop
      perform public.notify(null, o.office_id, false, 'quote_request', 'طلب عرض جديد', svc.title, '#job/' || new.id, 'quote:' || new.id || ':' || o.office_id);
    end loop;
  elsif new.office_id is not null and new.quoted_fee is not null and new.quoted_days is not null and new.quoted_days > 0 then
    insert into public.offers (request_id, office_id, fee, days, auto) values (new.id, new.office_id, new.quoted_fee, new.quoted_days, true)
      on conflict do nothing;
  end if;
  return new;
end $$;
revoke all on function public.handle_request_offers() from public, anon, authenticated;
create trigger on_request_offers after insert on public.requests
  for each row execute function public.handle_request_offers();

create or replace function public.handle_offer_sent() returns trigger
language plpgsql security definer set search_path = '' as $$
declare r public.requests%rowtype; svc text; who text;
begin
  if new.auto then return new; end if;
  select * into r from public.requests where id = new.request_id;
  select title into svc from public.services where id = r.service_id;
  select name into who from public.offices where id = new.office_id;
  perform public.notify(r.owner_id, null, false, 'offer', 'وصلك عرض جديد', svc || ' · ' || who, '#request/' || r.id, 'offer:' || new.id);
  return new;
end $$;
revoke all on function public.handle_offer_sent() from public, anon, authenticated;
create trigger on_offer_sent after insert on public.offers
  for each row execute function public.handle_offer_sent();

-- Acceptance fixes the terms: the agreement is a copy nobody edits afterwards.
create or replace function public.handle_request_agreed() returns trigger
language plpgsql security definer set search_path = '' as $$
declare o public.offers%rowtype;
begin
  if new.status = 'cancelled' and old.status <> 'cancelled' then
    update public.offers set status = 'withdrawn' where request_id = new.id and status = 'sent';
    return new;
  end if;
  if new.status <> 'accepted' or old.status = 'accepted' or new.office_id is null then return new; end if;
  update public.offers set status = 'accepted' where request_id = new.id and office_id = new.office_id and status = 'sent';
  select * into o from public.offers where request_id = new.id and office_id = new.office_id;
  insert into public.agreements (request_id, offer_id, office_id, fee, days, terms)
    values (new.id, o.id, new.office_id, coalesce(new.quoted_fee, 0), coalesce(new.quoted_days, 1), o.terms)
    on conflict (request_id) do nothing;
  return new;
end $$;
revoke all on function public.handle_request_agreed() from public, anon, authenticated;
create trigger on_request_agreed after update of status on public.requests
  for each row execute function public.handle_request_agreed();
insert into public.agreements (request_id, office_id, fee, days, agreed_at)
  select id, office_id, coalesce(quoted_fee, 0), greatest(coalesce(quoted_days, 1), 1), coalesce(accepted_at, created_at)
  from public.requests where office_id is not null and status in ('accepted', 'in_progress', 'done');

-- The owner picks one offer. The request becomes that provider's, on that offer's price, time and terms.
create or replace function public.accept_offer(p_offer uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare o public.offers%rowtype; r public.requests%rowtype; svc text; x record;
begin
  select * into o from public.offers where id = p_offer;
  if not found then raise exception 'offer_not_found'; end if;
  select * into r from public.requests where id = o.request_id for update;
  if not (r.owner_id = auth.uid() or public.is_admin()) then raise exception 'not_your_request'; end if;
  if r.mode <> 'quote' or r.status <> 'new' or r.office_id is not null then raise exception 'request_not_open'; end if;
  if o.status <> 'sent' or (o.valid_until is not null and o.valid_until < current_date) then raise exception 'offer_not_valid'; end if;
  select title into svc from public.services where id = r.service_id;
  perform set_config('waraqak.internal', '1', true);
  update public.requests set office_id = o.office_id, quoted_fee = o.fee, quoted_days = o.days, status = 'accepted', accepted_at = now() where id = r.id;
  update public.request_stages set started_at = now() where request_id = r.id and idx = 0 and started_at is null;
  for x in update public.offers set status = 'declined' where request_id = r.id and id <> o.id and status = 'sent' returning office_id loop
    perform public.notify(null, x.office_id, false, 'offer_declined', 'اختار صاحب العمل عرضًا آخر', svc, '#job/' || r.id, 'offer-no:' || r.id || ':' || x.office_id);
  end loop;
  perform set_config('waraqak.internal', '', true);
  insert into public.events (request_id, actor_id, kind) values (r.id, auth.uid(), 'accepted');
  perform public.notify(null, o.office_id, false, 'offer_accepted', 'قبل صاحب العمل عرضك', svc, '#job/' || r.id, 'offer-yes:' || o.id);
  return r.id;
end $$;
revoke all on function public.accept_offer(uuid) from public, anon;
grant execute on function public.accept_offer(uuid) to authenticated;

-- When an agreed service has a term, it becomes a document with a renewal date.
create or replace function public.handle_request_done() returns trigger
language plpgsql security definer set search_path = '' as $$
declare svc public.services%rowtype; ren public.services%rowtype; ren_id text; doc uuid;
begin
  if new.status <> 'done' or old.status = 'done' then return new; end if;
  select * into svc from public.services where id = new.service_id;
  insert into public.events (request_id, actor_id, kind) values (new.id, auth.uid(), 'done');
  if svc.mode = 'quote' then
    if svc.validity_days is not null then
      insert into public.documents (company_id, service_id, title, expires_on)
        values (new.company_id, svc.id, svc.title, current_date + svc.validity_days) returning id into doc;
      update public.agreements set expires_on = current_date + svc.validity_days, document_id = doc where request_id = new.id;
    end if;
    return new;
  end if;
  if new.document_id is not null and svc.validity_days is not null then
    update public.documents
      set expires_on = (greatest(coalesce(expires_on, current_date), current_date) + svc.validity_days)
      where id = new.document_id;
    return new;
  end if;
  ren_id := case new.service_id when 'commercial_register' then 'cr_renewal'
                                when 'tax_card' then 'tax_card_renewal'
                                when 'shop_license' then 'license_renewal' end;
  if ren_id is not null and svc.validity_days is not null then
    select * into ren from public.services where id = ren_id;
    insert into public.documents (company_id, service_id, title, expires_on)
      values (new.company_id, ren.id, replace(ren.title, 'تجديد ', ''), current_date + svc.validity_days);
  end if;
  if svc.kind = 'founding' and not exists (
    select 1 from public.requests where company_id = new.company_id and status not in ('done','cancelled') and id <> new.id) then
    update public.companies set status = 'active' where id = new.company_id and status = 'founding';
  end if;
  return new;
end $$;
