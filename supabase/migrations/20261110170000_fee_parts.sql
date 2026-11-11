-- Fees that are not one fixed number: a note shown beside the fee, and the parts a fee is
-- built from so the owner can work it out for their own capital. Plus the corrections from
-- the review of 10 November 2026.
alter table public.services
  add column fee_note text,
  add column fee_parts jsonb not null default '[]';   -- [{label, kind: percent|fixed, value, min, max, sure, note}]

-- Tax card: valid five years, issued within five working days (Unified Tax Procedures Law, art. 27).
update public.services set validity_days = 1825, self_days = 5, confidence = 'likely', reviewed_at = date '2026-11-10',
  sources = '[{"title": "قانون الإجراءات الضريبية الموحد رقم ٢٠٦ لسنة ٢٠٢٠", "url": "https://qadaya.net/?p=12464"},
              {"title": "الأهرام: مدة صلاحية البطاقة الضريبية خمس سنوات من تاريخ إصدارها", "url": "https://gate.ahram.org.eg/News/2525699.aspx"}]'
  where id in ('tax_card', 'tax_card_renewal');

-- Industrial register: renewed every five years, certificate within sixty days.
update public.services set validity_days = 1825, self_days = 60, confidence = 'likely', reviewed_at = date '2026-11-10',
  fee_note = 'لم نتأكد من قيمة الرسوم الحالية. اسأل هيئة التنمية الصناعية قبل التقديم.',
  sources = '[{"title": "قانون السجل الصناعي رقم ٢٤ لسنة ١٩٧٧", "url": "https://ghazylaw.com/industrial-registry-law/"},
              {"title": "تجديد قيد المنشأة بالسجل الصناعي بعد خمس سنوات", "url": "http://kenanaonline.com/users/ALDEWAN-DTC/posts/108552"}]'
  where id = 'industrial_renewal';

-- Public shops: the licence has no end date; fees are set by activity and area.
update public.services set validity_days = null, self_days = 90, gov_fee = 1000, confidence = 'likely', reviewed_at = date '2026-11-10',
  fee_note = 'رسم معاينة لا يجاوز ١٠٠٠ جنيه، ثم رسم ترخيص من ١٠٠٠ إلى ١٠٠ ألف جنيه تحدده لجنة التراخيص حسب النشاط والمساحة. بعض المحافظات تعلن خصومات مؤقتة.',
  sources = '[{"title": "قانون المحال العامة رقم ١٥٤ لسنة ٢٠١٩", "url": "https://qadaya.net/?p=12466"},
              {"title": "اليوم السابع: الجيزة تنشر المستندات المطلوبة لتراخيص المحال العامة", "url": "https://www.youm7.com/6006948"}]'
  where id = 'shop_license';
-- Under that law a licence does not expire, so a yearly renewal has no basis. Hidden until checked.
update public.services set active = false, review_note = 'أُخفيت في ١٠ نوفمبر ٢٠٢٦: ترخيص المحل غير محدد المدة في القانون ١٥٤ لسنة ٢٠١٩.' where id = 'license_renewal';

-- Commercial register: the five-year cycle is confirmed, the fee is not.
update public.services set reviewed_at = date '2026-11-10',
  fee_note = 'الرقم تقديري. المصادر المنشورة تذكر رسومًا أقل ومتفاوتة، فاسأل مكتب السجل قبل السداد.',
  sources = '[{"title": "الوطن: شروط طلب تجديد سجل تجاري عبر مصر الرقمية", "url": "https://www.elwatannews.com/news/details/8183418"},
              {"title": "تجديد السجل التجاري في مصر بعد خمس سنوات", "url": "https://www.horusvalley.com/egypt-commercial-register-renewal-five-years-digital-egypt/"}]'
  where id in ('cr_renewal', 'commercial_register');

update public.services set confidence = 'likely', reviewed_at = date '2026-11-10',
  sources = '[{"title": "دليل ضريبة القيمة المضافة في مصر: حد التسجيل ومواعيد الإقرار", "url": "https://www.fonoa.com/resources/country-tax-guides/egypt"}]'
  where id in ('vat_registration', 'monthly_tax_return');

update public.services set reviewed_at = date '2026-11-10', review_note = 'تأكدنا من مهلة تسجيل العامل (أسبوعان). قائمة مستندات فتح ملف المنشأة لم تُراجع.',
  sources = '[{"title": "اليوم السابع: إلزام صاحب العمل بتسجيل العامل خلال أسبوعين", "url": "https://www.youm7.com/7333694"}]'
  where id = 'social_insurance';

-- Incorporation: fees follow the capital. Two parts are fixed by the Companies Law; the rest are not confirmed.
update public.services set gov_fee = 350, confidence = 'likely', reviewed_at = date '2026-11-10',
  fee_note = 'الرسوم تتبع رأس المال. الرقم المعروض هو المؤكد منها لرأس مال ١٠٠ ألف جنيه. احسبها لرأس مالك من الحاسبة.',
  sources = '[{"title": "محكمة النقض: قانون الشركات رقم ١٥٩ لسنة ١٩٨١", "url": "https://www.cc.gov.eg/legislation_single?id=406763"},
              {"title": "قانون الشركات المصري مع أحدث التعديلات، المادة ١٧", "url": "https://draminlotfyoffice.com/details/832"}]',
  fee_parts = '[
    {"label": "رسم التأسيس", "kind": "percent", "value": 0.1, "min": 100, "max": 1000, "sure": true, "note": "واحد في الألف من رأس المال المدفوع، بنص المادة ١٧ من قانون الشركات"},
    {"label": "رسم التصديق على التوقيعات", "kind": "percent", "value": 0.25, "max": 1000, "sure": true, "note": "ربع في المائة من رأس المال، بنص المادة ١٧ من قانون الشركات"},
    {"label": "تصديق نقابة المحامين على العقد", "kind": "percent", "value": 1, "max": 25000, "sure": false, "note": "المصادر تذكر واحدًا في المائة بحد أقصى ٢٥ ألف جنيه، وتختلف في الحد الأدنى بين ٣٠٠ و٥٠٠٠ جنيه"},
    {"label": "اشتراك الغرفة التجارية", "kind": "percent", "value": 0.2, "max": 2000, "sure": false, "note": "اثنان في الألف من رأس المال بحسب غرفة القاهرة، والأرقام المنشورة قديمة"},
    {"label": "رسوم القيد في السجل التجاري", "kind": "fixed", "value": null, "sure": false, "note": "مبلغ ثابت لم نتأكد من قيمته الحالية"},
    {"label": "شهادة عدم التباس الاسم التجاري", "kind": "fixed", "value": null, "sure": false, "note": "مبلغ ثابت لم نتأكد من قيمته الحالية"}
  ]'
  where id = 'incorporation';

-- The change log follows the two new fee fields as well.
create or replace function public.log_service_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare f text; o jsonb := to_jsonb(old); n jsonb := to_jsonb(new);
begin
  foreach f in array array['title', 'agency', 'gov_fee', 'self_days', 'validity_days', 'docs', 'stages', 'sources', 'confidence', 'reviewed_at', 'mode', 'category_id', 'active', 'fee_note', 'fee_parts'] loop
    if o -> f is distinct from n -> f then
      insert into public.service_changes (service_id, field, old, new, changed_by) values (new.id, f, o -> f, n -> f, auth.uid());
    end if;
  end loop;
  return new;
end $$;
