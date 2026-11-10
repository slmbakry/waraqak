"use client";
// The owner's sections beyond the dashboard: obligations, actions, the
// company file and requests, all for the company being looked at.
import Link from "next/link";
import { sb } from "@/lib/supabase";
import { DAY, days, fmtDate, money, today } from "@/lib/format";
import { STATUS, docStatus, services, sortStages, stageLate } from "@/lib/data";
import { CompanySwitch, useCompanies, type Company } from "../companies";
import { applies, missingAnswers, occurrences, type Occurrence, type Profile, type Rule } from "@/lib/obligations";
import { useState } from "react";
import ObligationsPreview from "../ObligationsPreview";
import { PATHS, SOON_PATHS } from "@/lib/paths";
import { useLoad, useSession } from "../session";
import { Head, Icon, LoadError, Loading } from "../ui";
import Files from "./Files";

function NoCompany({ what }: { what: string }) {
  return (
    <section className="panel">
      <p>{what} تظهر بعد أن تبدأ تأسيس مشروعك أو تضيف شركة قائمة.</p>
      <div className="row">
        <Link className="btn primary" href="/guide">لدي فكرة مشروع</Link>
        <Link className="btn" href="/companies/new">لدي شركة قائمة</Link>
      </div>
    </section>
  );
}

// ---------- Obligations ----------
// Everything the company owes, by date: document renewals, open requests,
// and the recurring filings that apply to it, each with its source.
export function Obligations() {
  const { list, current, reload: reloadCompanies } = useCompanies();
  const { toast } = useSession();
  const { data, error, reload } = useLoad(async () => {
    if (!current) return null;
    const [svcs, { data: docs }, { data: reqs }, { data: rules }, { data: done }, { data: mutes }] = await Promise.all([
      services(),
      sb.from("documents").select("*").eq("company_id", current.id),
      sb.from("requests").select("id,service_id,status,document_id,quoted_days,accepted_at,created_at,offices(name)").eq("company_id", current.id).not("status", "in", "(done,cancelled)"),
      sb.from("obligation_rules").select("*").eq("active", true).order("sort"),
      sb.from("obligation_done").select("rule_id,period").eq("company_id", current.id),
      sb.from("obligation_mutes").select("rule_id").eq("company_id", current.id),
    ]);
    return { svcs, docs: docs || [], reqs: reqs || [], rules: (rules || []) as Rule[], done: new Set((done || []).map((d) => `${d.rule_id}|${d.period}`)), muted: new Set((mutes || []).map((m) => m.rule_id as string)) };
  }, [current?.id, current?.vat_registered, current?.has_employees, current?.simplified_tax, current?.fiscal_year_end, current?.legal_form]);

  const head = (
    <Head eyebrow={<>الالتزامات <CompanySwitch /></>} title="ما الذي على شركتك ومتى">
      <p>كل التزامات الشركة في مكان واحد ومرتبة حسب الموعد: التجديدات، والإقرارات الضريبية، والتأمينات، والاجتماع السنوي.</p>
    </Head>
  );
  if (!list) return <>{head}<Loading /></>;
  if (!current) return <>{head}<PlannedObligations /></>;
  if (error) return <>{head}<LoadError /></>;
  if (!data) return <>{head}<Loading /></>;

  type Ob = { date: Date; title: string; sub: string; tone: string; href: string | null; cta: string; occ?: Occurrence };
  const obs: Ob[] = [];
  const t = today().getTime();
  data.docs.forEach((d) => {
    if (!d.expires_on) return;
    const svc = data.svcs[d.service_id], st = docStatus(d, svc);
    const busy = data.reqs.find((r) => r.document_id === d.id);
    obs.push({ date: new Date(d.expires_on), title: `تجديد ${d.title}`,
      sub: busy ? "التجديد قيد التنفيذ" : st.left < 0 ? "انتهت صلاحيته" : `ابدأ التجديد من ${fmtDate(st.startOn)}`,
      tone: busy ? "" : st.cls === "bad" ? "bad" : st.cls === "warn" ? "warn" : "",
      href: busy ? `/requests/${busy.id}` : svc?.kind === "renewal" ? `/renew/${d.id}` : null, cta: busy ? "متابعة" : "تجديد" });
  });
  data.reqs.forEach((r) => {
    if (r.document_id) return;
    const due = new Date(new Date(r.accepted_at || r.created_at).getTime() + (r.quoted_days || 0) * DAY);
    obs.push({ date: due, title: data.svcs[r.service_id]?.title || r.service_id, sub: "الموعد المتوقع لانتهاء الطلب",
      tone: due.getTime() < t ? "bad" : "", href: `/requests/${r.id}`, cta: "متابعة" });
  });
  let doneCount = 0;
  data.rules.filter((r) => applies(r, current)).forEach((rule) => occurrences(rule, current).forEach((o) => {
    if (data.done.has(`${rule.id}|${o.period}`)) { doneCount++; return; }
    const left = (o.due.getTime() - t) / DAY;
    obs.push({ date: o.due, title: rule.title, sub: `${o.label} · ${rule.agency}`, tone: left < 0 ? "bad" : left <= 7 ? "warn" : "", href: null, cta: "", occ: o });
  }));
  obs.sort((a, b) => a.date.getTime() - b.date.getTime());

  const setReminders = async (on: boolean) => {
    const { error } = await sb.from("companies").update({ reminders_on: on }).eq("id", current.id);
    if (error) return toast("تعذّر الحفظ", true);
    toast(on ? "تم تفعيل التذكير" : "تم إيقاف التذكير"); reloadCompanies();
  };
  const toggleMute = async (ruleId: string) => {
    const muted = data.muted.has(ruleId);
    const { error } = muted
      ? await sb.from("obligation_mutes").delete().eq("company_id", current.id).eq("rule_id", ruleId)
      : await sb.from("obligation_mutes").insert({ company_id: current.id, rule_id: ruleId });
    if (error) return toast("تعذّر الحفظ", true);
    toast(muted ? "تم تفعيل التذكير بهذا الالتزام" : "لن يصلك تذكير بهذا الالتزام"); reload();
  };
  const markDone = async (o: Occurrence) => {
    const { error } = await sb.from("obligation_done").insert({ company_id: current.id, rule_id: o.rule.id, period: o.period });
    if (error) return toast("تعذّر الحفظ", true);
    toast("تم تسجيله كمكتمل"); reload();
  };
  const groups: [string, Ob[]][] = [
    ["متأخر", obs.filter((o) => o.date.getTime() < t)],
    ["خلال ٣٠ يومًا", obs.filter((o) => o.date.getTime() >= t && o.date.getTime() < t + 30 * DAY)],
    ["خلال ٣ أشهر", obs.filter((o) => o.date.getTime() >= t + 30 * DAY && o.date.getTime() < t + 90 * DAY)],
    // Further out, only the next time each recurring obligation falls due.
    ["لاحقًا", obs.filter((o) => o.date.getTime() >= t + 90 * DAY).filter((o, i, all) => !o.occ || all.findIndex((x) => x.occ?.rule.id === o.occ.rule.id) === i)],
  ];
  const ask = missingAnswers(current);
  return (
    <>
      {head}
      {(ask.vat || ask.employees) && <ProfileQuestions company={current} onSaved={reloadCompanies} />}
      <div className={"reminder-bar" + (current.reminders_on ? "" : " off")}>
        <Icon name="bell" size={18} />
        <span className="grow">{current.reminders_on
          ? "يصلك تنبيه قبل كل موعد بأسبوع، ومرة أخرى إذا فات الموعد ولم تعلّمه كمكتمل."
          : "التذكير بمواعيد الالتزامات متوقف لهذه الشركة."}</span>
        <button className="linkish" type="button" onClick={() => setReminders(!current.reminders_on)}>{current.reminders_on ? "إيقاف التذكير" : "تفعيل التذكير"}</button>
      </div>
      {obs.length ? groups.filter(([, g]) => g.length).map(([label, g]) => (
        <section key={label} className="panel"><h2>{label}</h2>
          <div className="ob-group">{g.map((o, i) => (
            <div key={i} className={`ob-row ${o.tone}`}>
              <span className="ob-date">{o.date.getDate()}<small>{o.date.toLocaleDateString("ar-EG", { month: "short", year: "numeric" })}</small></span>
              <span className="grow">
                <b>{o.title}</b><small className="note">{o.sub}</small>
                {o.occ && (
                  <details className="ob-why"><summary>لماذا وما المصدر؟</summary>
                    <p>{o.occ.rule.why}</p>
                    {o.occ.rule.certainty === "estimated" && <p className="note">الموعد تقديري، لأن المصادر المتاحة لا تحدده بدقة. راجعه مع مقدم الخدمة.</p>}
                    {o.occ.rule.source_url && <a href={o.occ.rule.source_url} target="_blank" rel="noopener noreferrer">{o.occ.rule.source_title || "المصدر"}</a>}
                    <small className="note">آخر مراجعة {fmtDate(o.occ.rule.checked_on)}</small>
                    {current.reminders_on && <button className="linkish" type="button" onClick={() => toggleMute(o.occ.rule.id)}>
                      {data.muted.has(o.occ.rule.id) ? "تفعيل التذكير بهذا الالتزام" : "إيقاف التذكير بهذا الالتزام"}</button>}
                  </details>
                )}
              </span>
              {o.occ?.rule.certainty === "estimated" && <span className="chip warn">تقديري</span>}
              {o.href && <Link className="btn small" href={o.href}>{o.cta}</Link>}
              {o.occ && <button className="btn small" type="button" onClick={() => markDone(o.occ)}>تم</button>}
            </div>
          ))}</div>
        </section>
      )) : (
        <section className="panel"><p className="empty">لا توجد التزامات مسجلة بعد. أضف مستندات الشركة وتواريخ انتهائها لتظهر هنا.</p>
          <Link className="btn" href={`/companies/${current.id}/documents/new`}>إضافة مستند</Link></section>
      )}
      {doneCount > 0 && <p className="note">أنجزت {doneCount === 1 ? "التزامًا واحدًا" : `${doneCount} من الالتزامات`} في هذه الفترة.</p>}
      <p className="note">المواعيد محسوبة من القوانين والقرارات المنشورة، وبجانب كل التزام مصدره. وقد تتغير المواعيد بقرارات جديدة، فنراجعها باستمرار.</p>
    </>
  );
}

// Before there is a company: the obligations a planned project will have.
function PlannedObligations() {
  const [p, setP] = useState<Profile>({ legal_form: "شركة الشخص الواحد", vat_registered: false, has_employees: false, simplified_tax: true, fiscal_year_end: 12 });
  const yn = (key: keyof Profile, label: string) => (
    <div className="field"><label>{label}</label>
      <div className="seg-choice">
        <label><input type="radio" checked={p[key] === true} onChange={() => setP({ ...p, [key]: true })} /> نعم</label>
        <label><input type="radio" checked={p[key] === false} onChange={() => setP({ ...p, [key]: false })} /> لا</label>
      </div></div>
  );
  return (
    <>
      <section className="panel navy-soft">
        <h2>لم تؤسس مشروعك بعد؟ اعرف التزاماته من الآن</h2>
        <p className="note">أجب عن مشروعك كما تتوقعه، وسنعرض لك الالتزامات الدورية التي ستكون عليه بعد التأسيس.</p>
        <div className="form-row two">
          <div className="field"><label htmlFor="pl-form">الكيان المتوقع</label>
            <select id="pl-form" value={p.legal_form} onChange={(e) => setP({ ...p, legal_form: e.target.value })}>
              {["منشأة فردية", "شركة الشخص الواحد", "شركة ذات مسئولية محدودة", "شركة مساهمة"].map((x) => <option key={x}>{x}</option>)}
            </select><small className="note">لا تعرف؟ <Link href="/guide">الدليل يساعدك تختار</Link>.</small></div>
          {yn("vat_registered", "هل تتوقع مبيعات ٥٠٠ ألف جنيه أو أكثر في السنة؟")}
          {yn("has_employees", "هل ستوظف عاملين؟")}
          {yn("simplified_tax", "هل المبيعات المتوقعة أقل من ٢٠ مليون جنيه في السنة؟")}
        </div>
      </section>
      <section className="panel"><ObligationsPreview profile={p} title="الالتزامات المتوقعة لمشروعك" /></section>
      <NoCompany what="مواعيد الالتزامات الفعلية والتذكير بها" />
    </>
  );
}

// The answers that decide which recurring obligations apply, asked once and in place.
function ProfileQuestions({ company, onSaved }: { company: Company; onSaved: () => void }) {
  const { toast } = useSession();
  const save = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const yes = (k: string) => (f.get(k) === "yes" ? true : f.get(k) === "no" ? false : null);
    const { error } = await sb.from("companies").update({ vat_registered: yes("vat"), has_employees: yes("emp"), simplified_tax: yes("simple"),
      fiscal_year_end: Number(f.get("fy")) || 12 }).eq("id", company.id);
    if (error) return toast("تعذّر حفظ الإجابات", true);
    toast("تم الحفظ، وظهرت التزامات شركتك"); onSaved();
  };
  const yn = (name: string, label: string, val: boolean | null, help: string) => (
    <div className="field"><label>{label}</label>
      <div className="seg-choice">
        <label><input type="radio" name={name} value="yes" defaultChecked={val === true} /> نعم</label>
        <label><input type="radio" name={name} value="no" defaultChecked={val === false} /> لا</label>
      </div><small className="note">{help}</small></div>
  );
  return (
    <section className="panel navy-soft">
      <h2>أجب عن أسئلة قليلة لنحسب التزامات شركتك</h2>
      <form className="stack" onSubmit={save}>
        {yn("vat", "هل الشركة مسجلة في ضريبة القيمة المضافة؟", company.vat_registered, "التسجيل إلزامي إذا بلغت المبيعات ٥٠٠ ألف جنيه في السنة.")}
        {yn("emp", "هل لدى الشركة موظفون مؤمَّن عليهم؟", company.has_employees, "يحدد ذلك التزامات التأمينات وضريبة المرتبات.")}
        {yn("simple", "هل الشركة منضمة إلى النظام الضريبي المبسط؟", company.simplified_tax, "النظام المبسط للمشروعات حتى ٢٠ مليون جنيه في السنة، ويغيّر مواعيد بعض الإقرارات.")}
        <div className="field"><label htmlFor="fy">نهاية السنة المالية</label>
          <select id="fy" name="fy" defaultValue={company.fiscal_year_end || 12}>
            {["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"].map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select><small className="note">في أغلب الشركات تنتهي السنة المالية في ديسمبر.</small></div>
        <button className="btn primary" type="submit">احفظ واحسب الالتزامات</button>
      </form>
    </section>
  );
}

// ---------- Actions ----------
// What the owner can do, starting from what they want rather than the procedure's name.
export function Actions() {
  const { current } = useCompanies();
  const { data } = useLoad(async () => {
    if (!current) return [];
    const [svcs, { data: docs }] = await Promise.all([services(), sb.from("documents").select("*").eq("company_id", current.id)]);
    return (docs || []).filter((d) => svcs[d.service_id]?.kind === "renewal");
  }, [current?.id]);
  return (
    <>
      <Head eyebrow={<>الإجراءات <CompanySwitch /></>} title="ماذا تريد أن تفعل؟">
        <p>اختر ما تريده بكلماتك، وسنوضح لك الإجراء المناسب وسببه، والمستندات المطلوبة، والتكلفة والمدة.</p>
      </Head>
      <section className="panel"><h2>البداية</h2>
        <div className="section-grid">
          <Link className="path-card" href="/guide"><span className="tile-ic gold"><Icon name="idea" /></span><b>لدي فكرة وأريد تأسيس مشروع</b>
            <small className="note">أسئلة قليلة تحدد الكيان المناسب، ثم خريطة خطواتك بالتكلفة والمدة.</small></Link>
          <Link className="path-card" href="/companies/new"><span className="tile-ic ok"><Icon name="building" /></span><b>لدي شركة قائمة وأريد إضافتها</b>
            <small className="note">أضف مستنداتها وتواريخ انتهائها لتصلك التذكيرات.</small></Link>
        </div>
      </section>
      {current && (
        <section className="panel"><h2>التجديد</h2>
          {!data ? <Loading /> : data.length ? (
            <div className="section-grid">{data.map((d) => {
              const st = docStatus(d);
              return (
                <Link key={d.id} className="path-card" href={`/renew/${d.id}`}><b>تجديد {d.title}</b>
                  <small className="note">{d.expires_on ? (st.left < 0 ? `انتهى في ${fmtDate(d.expires_on)}` : `ينتهي في ${fmtDate(d.expires_on)}`) : "بلا تاريخ انتهاء"}</small></Link>
              );
            })}</div>
          ) : <p className="empty">أضف مستندات الشركة لتظهر هنا إجراءات تجديدها.</p>}
        </section>
      )}
      <section className="panel"><h2>التعديل والالتزامات السنوية</h2>
        <p className="note">كل مسار يبدأ بأسئلة قليلة، ثم يوضح الإجراء ومن يقرره ولماذا، والمستندات والخطوات. يمكنك قراءته قبل أن تكون لديك شركة.</p>
        <div className="section-grid">{PATHS.map((p) => (
          <Link key={p.id} className="path-card" href={`/paths/${p.id}`}><span className="chip">{p.group}</span><b>{p.title}</b><small className="note">{p.sub}</small></Link>
        ))}</div>
      </section>
      <section className="panel"><h2>دليل أنشطة السجل التجاري</h2>
        <p className="note">ابحث عن نشاطك كما يُكتب في السجل، واعرف الأنشطة التي يُطلب إضافتها معه عادة.</p>
        <Link className="btn" href="/registry">افتح الدليل</Link>
      </section>
      <section className="panel"><h2>الأنشطة التي تحتاج ترخيصًا خاصًا</h2>
        <p className="note">مثل الاستيراد والتصدير والسمسرة العقارية والمقاولات والأغذية. لكل نشاط الجهة المختصة، ومتى تبدأ، والمستندات والخطوات.</p>
        <Link className="btn" href="/activities">عرض الأنشطة والتراخيص</Link>
      </section>
      {SOON_PATHS.length > 0 && <section className="panel"><h2>قيد الإعداد</h2>
        <div className="section-grid">{SOON_PATHS.map((p) => (
          <div key={p.title} className="path-card soon" aria-disabled="true"><span className="chip">{p.group} · قيد الإعداد</span><b>{p.title}</b><small className="note">{p.sub}</small></div>
        ))}</div>
      </section>}
    </>
  );
}

// ---------- Company file ----------
export function CurrentFiles() {
  const { list, current } = useCompanies();
  if (!list) return <Loading />;
  if (!current) return <><Head eyebrow="ملف الشركة" title="مستندات شركتك في مكان واحد" /><NoCompany what="ملفات الشركة" /></>;
  return <Files companyId={current.id} switcher={<CompanySwitch />} />;
}

// ---------- Requests ----------
export function MyRequests() {
  const { list, current } = useCompanies();
  const { data, error } = useLoad(async () => {
    if (!current) return null;
    const [svcs, { data: reqs }] = await Promise.all([
      services(),
      sb.from("requests").select("*, offices(name), request_stages(idx,title,planned_days,started_at,done_at)").eq("company_id", current.id).order("created_at", { ascending: false }),
    ]);
    return { svcs, reqs: reqs || [] };
  }, [current?.id]);
  const head = <Head eyebrow={<>طلباتي <CompanySwitch /></>} title="إجراءات شركتك"><p>كل إجراء بدأته، مع حالته ومرحلته الحالية.</p></Head>;
  if (!list) return <>{head}<Loading /></>;
  if (!current) return <>{head}<NoCompany what="الطلبات" /></>;
  if (error) return <>{head}<LoadError /></>;
  if (!data) return <>{head}<Loading /></>;
  const open = data.reqs.filter((r) => !["done", "cancelled"].includes(r.status)), closed = data.reqs.filter((r) => !open.includes(r));
  const card = (r) => {
    const st = sortStages(r.request_stages), cur = st.find((x) => !x.done_at), late = cur && ["accepted", "in_progress"].includes(r.status) ? stageLate(cur) : 0;
    return (
      <Link key={r.id} className={"req" + (late ? " late" : "")} href={`/requests/${r.id}`}>
        <div className="row between"><b>{data.svcs[r.service_id]?.title || r.service_id}</b>
          {late ? <span className="chip bad">متأخر {days(late)}</span> : <span className={`chip ${STATUS[r.status][0]}`}>{STATUS[r.status][1]}</span>}</div>
        <small>{r.office_id ? r.offices?.name : "تنفذه بنفسك"} · {money(r.quoted_fee)}{cur ? ` · المرحلة الحالية: ${cur.title}` : ""}</small>
      </Link>
    );
  };
  return (
    <>
      {head}
      <section className="panel"><h2>قيد التنفيذ</h2>{open.length ? <div className="reqs">{open.map(card)}</div> : <p className="empty">لا توجد طلبات قيد التنفيذ.</p>}
        <Link className="btn" href="/actions">ابدأ إجراءً جديدًا</Link></section>
      {closed.length > 0 && <section className="panel"><h2>السابقة</h2><div className="reqs">{closed.map(card)}</div></section>}
    </>
  );
}
