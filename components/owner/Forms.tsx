"use client";
// Adding an existing company with its documents, adding one document, and choosing who renews a document.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { sb } from "@/lib/supabase";
import { days, money, span } from "@/lib/format";
import { docStatus, optionsFor, services } from "@/lib/data";
import { useLoad, useSession } from "../session";
import { Head, Icon, LoadError, Loading, OptionCards } from "../ui";
import Requirements from "../Requirements";
import { placeOf } from "@/lib/places";
import PlaceFields, { placesFrom } from "./PlaceFields";
import { CompanySwitch, useCompanies } from "../companies";
import ActivityPicker from "../ActivityPicker";

const docTitle = (t: { title: string }) => t.title.replace("تجديد ", "");
const FORMS = ["شركة ذات مسئولية محدودة", "شركة الشخص الواحد", "منشأة فردية", "شركة مساهمة", "شركة توصية بسيطة"];

const renewals = async () => Object.values(await services()).filter((s) => s.kind === "renewal");

export function CompanyNew() {
  const router = useRouter();
  const { uid, isPreview, toast } = useSession();
  const { data: types, error } = useLoad(renewals, []);
  const [busy, setBusy] = useState(false);
  const [acts, setActs] = useState<string[] | null>(null);
  if (error) return <LoadError />;
  if (!types) return <Loading />;

  const save = async (ev: React.FormEvent<HTMLFormElement>) => {
    ev.preventDefault();
    const f = new FormData(ev.currentTarget);
    setBusy(true);
    const { data: co, error } = await sb.from("companies").insert({ owner_id: uid, name: String(f.get("name")).trim(), legal_form: f.get("form"), is_demo: isPreview, activities: acts, ...placesFrom(f) }).select().single();
    if (error) { setBusy(false); return toast("تعذّر حفظ الشركة، حاول مرة أخرى", true); }
    const docs = types.map((t) => ({ t, v: String(f.get("exp-" + t.id) || "") })).filter((x) => x.v)
      .map(({ t, v }) => ({ company_id: co.id, service_id: t.id, title: docTitle(t), expires_on: v }));
    if (docs.length) { const { error: e2 } = await sb.from("documents").insert(docs); if (e2) toast("تم حفظ الشركة، لكن تعذّر حفظ المستندات", true); }
    toast("تم حفظ الشركة"); router.push("/companies/" + co.id);
  };

  return (
    <>
      <Head eyebrow="شركة قائمة" title="أضف شركتك ومستنداتها"><p>اكتب تاريخ انتهاء كل مستند، وستحسب المنصة موعد بدء تجديده.</p></Head>
      <form className="stack" onSubmit={save}>
        <section className="panel">
          <h2>بيانات الشركة</h2>
          <div className="form-row two">
            <div className="field"><label htmlFor="c-name">اسم الشركة</label><input id="c-name" name="name" required /></div>
            <div className="field"><label htmlFor="c-form">الشكل القانوني</label><select id="c-form" name="form">{FORMS.map((x) => <option key={x}>{x}</option>)}</select></div>
          </div>
          <PlaceFields />
        </section>
        <section className="panel">
          <h2>نشاط الشركة</h2>
          <p className="note">بعض الأنشطة تحتاج ترخيصًا أو قيدًا خاصًا. اختر ما ينطبق على شركتك، وسننبهك إلى المطلوب لكل نشاط.</p>
          <ActivityPicker value={acts} onChange={setActs} />
        </section>
        <section className="panel">
          <div className="row between"><h2>المستندات</h2><span className="note">اترك التاريخ فارغًا إذا لم يكن لدى الشركة هذا المستند</span></div>
          <div className="doc-inputs">
            {types.map((t) => (
              <div key={t.id} className="doc-input"><span className="tile-ic"><Icon name="doc" size={22} /></span>
                <div className="field"><label htmlFor={`exp-${t.id}`}>{docTitle(t)}</label><small className="note">{t.agency} · تاريخ الانتهاء</small><input type="date" id={`exp-${t.id}`} name={`exp-${t.id}`} /></div>
              </div>
            ))}
          </div>
          <button className="btn primary" type="submit" disabled={busy}>حفظ الشركة</button>
        </section>
      </form>
    </>
  );
}

export function DocNew({ companyId }: { companyId: string }) {
  const router = useRouter();
  const { toast } = useSession();
  const { data: types, error } = useLoad(renewals, []);
  if (error) return <LoadError />;
  if (!types) return <Loading />;
  const save = async (ev: React.FormEvent<HTMLFormElement>) => {
    ev.preventDefault();
    const f = new FormData(ev.currentTarget);
    const t = types.find((x) => x.id === f.get("type"));
    const { error } = await sb.from("documents").insert({ company_id: companyId, service_id: t.id, title: docTitle(t), expires_on: f.get("exp") });
    if (error) return toast("تعذّر حفظ المستند", true);
    toast("تم حفظ المستند"); router.push("/companies/" + companyId);
  };
  return (
    <>
      <Head back={[`/companies/${companyId}`, "لوحتي"]} title="إضافة مستند" />
      <form className="panel" onSubmit={save}>
        <div className="form-row two">
          <div className="field"><label htmlFor="d-type">نوع المستند</label><select id="d-type" name="type">{types.map((t) => <option key={t.id} value={t.id}>{docTitle(t)}</option>)}</select></div>
          <div className="field"><label htmlFor="d-exp">تاريخ الانتهاء</label><input type="date" id="d-exp" name="exp" required /></div>
        </div>
        <button className="btn primary" type="submit">حفظ المستند</button>
      </form>
    </>
  );
}

export function Renew({ docId }: { docId: string }) {
  const router = useRouter();
  const { uid, isPreview, toast } = useSession();
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { data, error } = useLoad(async () => {
    const svcs = await services();
    const { data: d } = await sb.from("documents").select("*, companies(id,name,owner_id,governorate,registry_office,tax_office)").eq("id", docId).maybeSingle();
    if (!d) return { d: null };
    return { d, s: svcs[d.service_id], opts: await optionsFor(d.service_id, isPreview) };
  }, [docId, isPreview]);
  if (error) return <LoadError />;
  if (!data) return <Loading />;
  const { d, s, opts } = data;
  if (!d) return <section className="panel"><p>هذا المستند غير موجود.</p></section>;
  // A service agreed by offer is renewed by asking for offers again.
  if (s?.mode === "quote") return <section className="panel"><p>تجديد {d.title} يتم بطلب عروض جديدة من مقدمي الخدمة.</p><Link className="btn primary" href={`/services/${s.id}`}>اطلب عروضًا</Link></section>;

  const pick = picked ?? (opts[1]?.key || "self");
  const o = opts.find((x) => x.key === pick);
  const st = docStatus(d, s);
  const when = st.left === null ? "" : st.left < 0 ? `انتهى منذ ${span(-st.left)}` : `ينتهي بعد ${span(st.left)}`;
  const go = async () => {
    setBusy(true);
    const { data: r, error } = await sb.from("requests").insert({ company_id: d.company_id, owner_id: uid, service_id: d.service_id, document_id: d.id,
      office_id: o.officeId, quoted_fee: o.cost, quoted_days: o.days, is_demo: isPreview }).select().single();
    if (error) { setBusy(false); return toast("تعذّر إنشاء الطلب", true); }
    toast(o.officeId ? "تم إرسال الطلب إلى " + o.label : "تم إنشاء الطلب، ويمكنك متابعة خطواته بنفسك");
    router.push("/requests/" + r.id);
  };
  return (
    <>
      <Head back={[`/companies/${d.company_id}`, "لوحتي"]} eyebrow={d.companies.name} title={s.title}>
        <p>{when ? `${d.title}: ${when}. ` : ""}قارن واختر من ينفذ التجديد.</p>
      </Head>
      <div className="split">
        <section className="panel split-main"><h2>اختر من ينفذ</h2>
          <OptionCards opts={opts} name="alt" picked={pick} onPick={setPicked} />
          <div className="confirm"><span>{o.label} · <b>{money(o.cost)}</b> · {days(o.days)}</span>
            <button className="btn primary" type="button" disabled={busy} onClick={go}>تأكيد الطلب</button></div>
        </section>
        <aside className="split-side">
          <section className="panel"><Requirements serviceId={s.id} kind={s.place_kind} place={placeOf(d.companies, s.place_kind)} title="جهّز هذه المستندات" /></section>
          <section className="panel"><h2>كيف رتّبنا الخيارات</h2><p className="note">التقييم من أصحاب الأعمال بعد كل طلب، ونسبة الالتزام بالمواعيد محسوبة من تواريخ الطلبات نفسها.</p></section>
        </aside>
      </div>
    </>
  );
}


export function CompanyEdit({ companyId }: { companyId: string }) {
  const router = useRouter();
  const { toast } = useSession();
  const [busy, setBusy] = useState(false);
  const [acts, setActs] = useState<string[] | null | undefined>(undefined);
  const { data: co, error } = useLoad(async () => {
    const { data } = await sb.from("companies").select("id,name,legal_form,governorate,registry_office,tax_office,vat_registered,has_employees,simplified_tax,fiscal_year_end,activities").eq("id", companyId).maybeSingle();
    return data;
  }, [companyId]);
  if (error) return <LoadError />;
  if (co === undefined) return <Loading />;
  if (!co) return <section className="panel"><p>هذه الشركة غير موجودة.</p></section>;
  const save = async (ev: React.FormEvent<HTMLFormElement>) => {
    ev.preventDefault();
    const f = new FormData(ev.currentTarget);
    setBusy(true);
    const { error } = await sb.from("companies").update({ name: String(f.get("name")).trim(), legal_form: f.get("form"), ...placesFrom(f),
      vat_registered: tri(f.get("vat")), has_employees: tri(f.get("emp")), simplified_tax: tri(f.get("simple")), fiscal_year_end: Number(f.get("fy")) || 12, activities: acts === undefined ? co.activities : acts }).eq("id", companyId);
    setBusy(false);
    if (error) return toast("تعذّر حفظ بيانات الشركة", true);
    toast("تم حفظ بيانات الشركة"); router.push("/companies/" + companyId);
  };
  const forms = FORMS.includes(co.legal_form) || !co.legal_form ? FORMS : [co.legal_form, ...FORMS];
  return (
    <>
      <Head back={[`/companies/${companyId}`, "لوحتي"]} eyebrow={co.name} title="بيانات الشركة" />
      <form className="panel" onSubmit={save}>
        <div className="form-row two">
          <div className="field"><label htmlFor="c-name">اسم الشركة</label><input id="c-name" name="name" required defaultValue={co.name} /></div>
          <div className="field"><label htmlFor="c-form">الشكل القانوني</label><select id="c-form" name="form" defaultValue={co.legal_form || FORMS[0]}>{forms.map((x) => <option key={x}>{x}</option>)}</select></div>
        </div>
        <PlaceFields values={co} />
        <h3 className="sub">الضرائب والموظفون</h3>
        <div className="form-row two">
          {triSelect("vat", "مسجلة في ضريبة القيمة المضافة", co.vat_registered)}
          {triSelect("emp", "لديها موظفون مؤمَّن عليهم", co.has_employees)}
          {triSelect("simple", "منضمة إلى النظام الضريبي المبسط", co.simplified_tax)}
          <div className="field"><label htmlFor="fy">نهاية السنة المالية</label>
            <select id="fy" name="fy" defaultValue={co.fiscal_year_end || 12}>{MONTH_NAMES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select></div>
        </div>
        <small className="note">هذه الإجابات تحدد الإقرارات والاشتراكات التي تظهر في صفحة الالتزامات.</small>
        <h3 className="sub" id="activities">نشاط الشركة</h3>
        <p className="note">بعض الأنشطة تحتاج ترخيصًا أو قيدًا خاصًا. اختر ما ينطبق على شركتك.</p>
        <ActivityPicker value={acts === undefined ? co.activities ?? null : acts} onChange={setActs} />
        <button className="btn primary" type="submit" disabled={busy}>حفظ</button>
      </form>
    </>
  );
}

const MONTH_NAMES = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
const tri = (v: FormDataEntryValue | null) => (v === "yes" ? true : v === "no" ? false : null);
function triSelect(name: string, label: string, value: boolean | null) {
  return (
    <div className="field"><label htmlFor={`t-${name}`}>{label}</label>
      <select id={`t-${name}`} name={name} defaultValue={value === true ? "yes" : value === false ? "no" : ""}>
        <option value="">لم يُحدَّد</option><option value="yes">نعم</option><option value="no">لا</option>
      </select></div>
  );
}

// Starting any service for the current company: compare doing it yourself
// with each provider, then create the request.
export function StartService({ serviceId }: { serviceId: string }) {
  const router = useRouter();
  const { uid, isPreview, toast } = useSession();
  const { list, current } = useCompanies();
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { data, error } = useLoad(async () => {
    const s = (await services())[serviceId];
    return s ? { s, opts: await optionsFor(s.id, isPreview) } : { s: null };
  }, [serviceId, isPreview]);
  if (error) return <LoadError />;
  if (!data || !list) return <Loading />;
  const { s, opts } = data;
  if (!s) return <section className="panel"><p>هذه الخدمة غير موجودة.</p></section>;
  if (!current) return (
    <section className="panel"><p>لتنفيذ هذا الإجراء ومتابعته، أضف شركتك أولًا.</p>
      <Link className="btn primary" href="/companies/new">إضافة شركتي</Link></section>
  );
  const pick = picked ?? (opts[1]?.key || "self");
  const o = opts.find((x) => x.key === pick);
  const go = async () => {
    setBusy(true);
    const { data: r, error } = await sb.from("requests").insert({ company_id: current.id, owner_id: uid, service_id: s.id,
      office_id: o.officeId, quoted_fee: o.cost, quoted_days: o.days, is_demo: isPreview }).select().single();
    if (error) { setBusy(false); return toast("تعذّر إنشاء الطلب", true); }
    toast(o.officeId ? "تم إرسال الطلب إلى " + o.label : "تم إنشاء الطلب، ويمكنك متابعة خطواته بنفسك");
    router.push("/requests/" + r.id);
  };
  return (
    <>
      <Head back={["/actions", "الإجراءات"]} eyebrow={<>{current.name} <CompanySwitch /></>} title={s.title}>
        <p>قارن واختر من ينفذ الإجراء، بنفسك أو مع مقدم خدمة.</p>
      </Head>
      <div className="split">
        <section className="panel split-main"><h2>اختر من ينفذ</h2>
          <OptionCards opts={opts} name="alt" picked={pick} onPick={setPicked} />
          {opts.length === 1 && <p className="note">لم يحدد أي مقدم خدمة سعرًا لهذه الخدمة بعد، ويمكنك تنفيذها بنفسك ومتابعة خطواتها هنا.</p>}
          <div className="confirm"><span>{o.label} · <b>{money(o.cost)}</b> · {days(o.days)}</span>
            <button className="btn primary" type="button" disabled={busy} onClick={go}>تأكيد الطلب</button></div>
        </section>
        <aside className="split-side">
          <section className="panel"><Requirements serviceId={s.id} kind={s.place_kind} place={placeOf(current, s.place_kind)} title="جهّز هذه المستندات" /></section>
        </aside>
      </div>
    </>
  );
}
