-- Messages inside a request: both sides write, and the provider can ask for a missing
-- document as its own kind of entry so the owner sees exactly what to upload.
alter table public.events add constraint events_note_len check (note is null or length(note) <= 2000);

-- The notification trigger learns the new entry kind, and calls a note what the screens call it.
do $$
declare d text := pg_get_functiondef('public.handle_event_notify'::regproc);
begin
  d := replace(d, $a$when 'note', 'file' then$a$, $a$when 'note', 'file', 'doc_request' then$a$);
  d := replace(d, $a$t := case new.kind when 'note' then 'ملاحظة جديدة' else 'ملف جديد' end;$a$,
                  $a$t := case new.kind when 'note' then 'رسالة جديدة' when 'doc_request' then 'مطلوب منك مستند' else 'ملف جديد' end;$a$);
  execute d;
end $$;

alter policy events_insert on public.events with check (
  actor_id = (select auth.uid()) and (select public.can_see_request(request_id)) and (
    kind in ('note', 'file')
    or (select public.is_admin())
    or (kind in ('accepted', 'declined', 'doc_request') and exists (select 1 from public.requests r where r.id = request_id and r.office_id = (select public.my_office())))
    or (kind in ('cancelled', 'rated') and exists (select 1 from public.requests r where r.id = request_id and r.owner_id = (select auth.uid())))
  ));
