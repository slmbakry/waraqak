"use client";
// Owner dashboard. One company at a time: a navy cover card, what needs the
// owner now, documents with how much validity is left, and requests stage by stage.
import Link from "next/link";
import { sb } from "@/lib/supabase";
import { DAY, days, fmtDate, money, num, span, today } from "@/lib/format";
import { docStatus, services, sortStages, stageLate } from "@/lib/data";
import { pathFor } from "@/lib/storage";
import { fmtSize } from "@/lib/files";
import { applies, occurrences, type Rule } from "@/lib/obligations";
import { activitiesOf } from "@/lib/activities";
import { useLoad, useSession } from "../session";
import { Avatar, Head, Icon, Kpi, LoadError, Loading } from "../ui";

const BAD = ["late", "overdue", "expired", "escalated", "declined"];
const feedTone = (kind: string) => (BAD.includes(kind) ? "bad" : ["renew", "wait"].includes(kind) ? "warn" : "ok");

export default function OwnerHome({ companyId }: { companyId?: string }) {
  const { uid } = useSession();
  const { data, error } = useLoad(async () => {
    const svcs = await services();
    const { data: companies } = await sb.from("companies").select("*").eq("owner_id", uid).neq("status", "closed").order("created_at");
    if (!companies?.length) return { svcs, companies: [] };
    const co = companies.find((c) => c.id === companyId) || companies[0];
    const [{ data: docs }, { data: reqs }, { data: notes }, { data: used }, { data: plan }, { count: fileCount }, { data: rules }, { data: done }, { data: actStatus }] = await Promise.all([
      sb.from("documents").select("*").eq("company_id", co.id).order("expires_on", { nullsFirst: false }),
      sb.from("requests").select("*, offices(name), request_stages(idx,title,planned_days,started_at,done_at)").eq("company_id", co.id).order("created_at", { ascending: false }),
      sb.from("notifications").select("*").eq("user_id", uid).order("created_at", { ascending: false }).limit(4),
      sb.rpc("company_usage", { cid: co.id }),
      sb.from("plans").select("title,storage_bytes").eq("id", co.plan).maybeSingle(),
      sb.from("company_files").select("id", { count: "exact", head: true }).eq("company_id", co.id),
      sb.from("obligation_rules").select("*").eq("active", true),
      sb.from("obligation_done").select("rule_id,period").eq("company_id", co.id),
      sb.from("activity_status").select("activity_id").eq("company_id", co.id),
    ]);
    // Recurring obligations that are overdue or due within a week.
    const doneSet = new Set((done || []).map((d) => `${d.rule_id}|${d.period}`));
    const soon = ((rules || []) as Rule[]).filter((r) => applies(r, co)).flatMap((r) => occurrences(r, co, 60, 7))
      .filter((o) => !doneSet.has(`${o.rule.id}|${o.period}`));
    const doneWithOffice = (reqs || []).filter((r) => r.status === "done" && r.office_id);
    const { data: rated } = doneWithOffice.length ? await sb.from("ratings").select("request_id").in("request_id", doneWithOffice.map((r) => r.id)) : { data: [] };
    const ratedIds = new Set((rated || []).map((x) => x.request_id));
    return { svcs, companies, co, docs: docs || [], reqs: reqs || [], notes: notes || [], used: Number(used || 0), plan, fileCount: fileCount || 0, soon, actDone: new Set((actStatus || []).map((x) => x.activity_id)), askProfile: co.vat_registered === null || co.has_employees === null, toRate: doneWithOffice.find((r) => !ratedIds.has(r.id)) };
  }, [uid, companyId]);

  if (error) return <LoadError />;
  if (!data) return <Loading />;
  const { svcs, companies, co, docs, reqs, notes, toRate, used, plan, fileCount, soon, askProfile, actDone } = data;

  if (!companies.length) return (
    <>
      <Head eyebrow="لوحتي" title="ابدأ بأول شركة">
        <p>إذا كان لديك مشروع جديد، فسيعرض لك الدليل خطواتك. وإذا كانت لديك شركة قائمة، فأضفها بمستنداتها وتواريخ انتهائها، وستذكّرك المنصة قبل كل تجديد.</p>
      </Head>
      <div className="choices">
        <Link className="choice" href="/guide"><span className="tile-ic gold"><Icon name="idea" size={24} /></span><h3>لدي فكرة أو مشروع غير مسجل</h3><p>أسئلة قليلة، ثم خريطة خطواتك بالتكلفة والمدة.</p></Link>
        <Link className="choice" href="/companies/new"><span className="tile-ic ok"><Icon name="building" size={24} /></span><h3>لدي شركة قائمة</h3><p>أضف مستنداتها، وتابع تجديداتها من مكان واحد.</p></Link>
      </div>
    </>
  );

  const open = reqs.filter((r) => !["done", "cancelled"].includes(r.status));
  const list = docs.map((d) => {
    const svc = svcs[d.service_id], st = docStatus(d, svc), req = open.find((r) => r.document_id === d.id);
    return { d, svc, st, req, cls: req ? "busy" : st.cls };
  });
  const count = (k: string) => list.filter((x) => x.cls === k).length;
  const healthy = count("ok");

  // What the owner should do, most urgent first.
  type Todo = { tone: string; ic: string; title: string; sub: string; href: string | null; cta: string; soft?: boolean };
  const todo: Todo[] = [];
  list.filter((x) => x.cls === "bad").forEach((x) => todo.push({ tone: "bad", ic: "alert", title: `انتهت صلاحية ${x.d.title} منذ ${span(-x.st.left)}`,
    sub: "جدّده في أسرع وقت لتجنب الغرامات", href: x.svc?.kind === "renewal" ? `/renew/${x.d.id}` : null, cta: "جدّد الآن" }));
  list.filter((x) => x.cls === "warn").forEach((x) => todo.push({ tone: "warn", ic: "clock", title: `ابدأ تجديد ${x.d.title}`,
    sub: `ينتهي بعد ${span(x.st.left)}، والتجديد يستغرق وقتًا`, href: x.svc?.kind === "renewal" ? `/renew/${x.d.id}` : null, cta: "اطلب التجديد" }));
  open.filter((r) => !r.office_id).forEach((r) => todo.push({ tone: "warn", ic: "arrow", title: `${svcs[r.service_id]?.title || ""}: خطوة مطلوبة منك`,
    sub: "تنفذه بنفسك، حدّد كل مرحلة عند اكتمالها", href: `/requests/${r.id}`, cta: "أكمل الخطوة", soft: true }));
  open.filter((r) => r.status === "new" && r.office_id && Date.now() - new Date(r.created_at).getTime() > DAY).forEach((r) => todo.push({ tone: "info", ic: "clock",
    title: `${r.offices?.name || "مقدم الخدمة"} لم يرد بعد`, sub: `${svcs[r.service_id]?.title || ""} · يمكنك إلغاؤه واختيار مقدم خدمة آخر`, href: `/requests/${r.id}`, cta: "عرض الطلب", soft: true }));

  const late = soon.filter((o) => o.due < today());
  if (soon.length) todo.unshift({ tone: late.length ? "bad" : "warn", ic: "clock",
    title: late.length ? `${num(late.length)} من الالتزامات الدورية فات موعدها` : `${num(soon.length)} من الالتزامات الدورية خلال أسبوع`,
    sub: soon.slice(0, 2).map((o) => o.rule.title).join("، "), href: "/obligations", cta: "عرض الالتزامات" });
  // Licensed activities the owner has not dealt with yet.
  activitiesOf(co.activities).filter((a) => !actDone.has(a.id) && !reqs.some((r) => r.service_id === a.serviceId && r.status !== "cancelled"))
    .forEach((a) => todo.push({ tone: "warn", ic: "doc", title: `نشاط ${a.title} يحتاج ترخيصًا خاصًا`,
      sub: `من ${a.authority}. اعرف الخطوات، أو أخبرنا إن كان لدى الشركة الترخيص`, href: `/activities/${a.id}`, cta: "اعرف المطلوب" }));
  if (co.activities === null) todo.push({ tone: "info", ic: "list", title: "حدّد أنشطة الشركة",
    sub: "لنعرف إن كان نشاطك يحتاج ترخيصًا خاصًا غير السجل التجاري والبطاقة الضريبية", href: `/companies/${co.id}/edit#activities`, cta: "حدّد الأنشطة", soft: true });
  if (askProfile) todo.push({ tone: "info", ic: "list", title: "أكمل بيانات الشركة لنحسب التزاماتها",
    sub: "ثلاثة أسئلة عن القيمة المضافة والموظفين والنظام الضريبي", href: "/obligations", cta: "أكمل البيانات", soft: true });
  const ring = list.length ? Math.round((healthy / list.length) * 163) : 0;
  const summary = !list.length ? "لا توجد مستندات لهذه الشركة بعد."
    : count("bad") || count("warn") ? [count("bad") && `${num(count("bad"))} منتهي`, count("warn") && `${num(count("warn"))} يقترب من الانتهاء`, count("busy") && `${num(count("busy"))} قيد التجديد`].filter(Boolean).join("، ") + ". التفاصيل بالأسفل، وبجانب كل مستند الخطوة التالية."
    : "جميع مستنداتك سارية. سنذكّرك قبل أي تجديد بوقت كافٍ.";

  return (
    <>
      <section className="head hero">
        <div className="tabs" role="tablist" aria-label="شركاتك">
          {companies.map((x) => <Link key={x.id} className="tab" role="tab" aria-selected={x.id === co.id} href={`/companies/${x.id}`}>{x.name}{x.is_demo ? " · تجريبي" : ""}</Link>)}
          <Link className="tab add" href="/companies/new">+ شركة جديدة</Link>
        </div>
        <div className="hero-row">
          <div className="hero-t">
            <span className="eyebrow">{co.legal_form || ""}{co.status === "founding" ? " · تحت التأسيس" : " · نشطة"}</span>
            <h1>{co.name}</h1><p>{summary}</p>
            <p className="hero-meta">
              {[co.governorate, co.registry_office && `سجل ${co.registry_office}`, co.tax_office && `مأمورية ${co.tax_office}`].filter(Boolean).join(" · ") || "لم تُحدَّد جهات الشركة بعد"}
              {" · "}<Link className="on-navy-link" href={`/companies/${co.id}/edit`}>تعديل بيانات الشركة</Link>
            </p>
          </div>
          {list.length > 0 && (
            <div className="ring">
              <svg width="64" height="64" viewBox="0 0 64 64" role="img" aria-label={`${num(healthy)} من ${num(list.length)} مستندات سارية`}>
                <circle cx="32" cy="32" r="26" fill="none" stroke="rgba(255,255,255,.14)" strokeWidth="7" />
                <circle cx="32" cy="32" r="26" fill="none" stroke="#1F9D74" strokeWidth="7" strokeLinecap="round" strokeDasharray={`${ring} 163`} transform="rotate(-90 32 32)" />
              </svg>
              <div><b>{num(healthy)} من {num(list.length)}</b><span>مستندات سارية</span></div>
            </div>
          )}
        </div>
      </section>
      <div className="kpis">
        <Kpi ic="docOk" tone="ok" value={healthy} label="مستندات سارية" />
        <Kpi ic="calendar" tone="warn" value={count("warn") + count("busy")} label="تجديد قريب" />
        <Kpi ic="alert" tone="bad" value={count("bad")} label="منتهي" />
        <Kpi ic="list" value={open.length} label="طلبات قيد التنفيذ" />
      </div>
      <div className="split">
        <div className="split-main">
          <section className="panel">
            <div className="row between"><h2>المطلوب منك الآن</h2>{todo.length > 0 && <span className="note">مرتّب حسب الأهمية</span>}</div>
            {todo.length ? todo.map((t, i) => (
              <div key={i} className={`todo ${t.tone}`}>
                <span className="todo-ic"><Icon name={t.ic} /></span>
                <div className="todo-t"><b>{t.title}</b><small>{t.sub}</small></div>
                {t.href && <Link className={`btn ${t.soft ? "" : t.tone === "bad" ? "danger-solid" : "primary"}`} href={t.href}>{t.cta}</Link>}
              </div>
            )) : (
              <div className="todo ok"><span className="todo-ic"><Icon name="check" /></span><div className="todo-t"><b>لا يوجد شيء مطلوب منك الآن</b><small>سنرسل إليك تنبيهًا عندما يتطلب الأمر تدخلك.</small></div></div>
            )}
          </section>
          <section className="panel">
            <div className="row between"><h2>المستندات</h2><Link className="link" href={`/companies/${co.id}/documents/new`}>+ إضافة مستند</Link></div>
            {list.length ? <div className="doc-grid">{list.map((x) => <DocCard key={x.d.id} x={x} companyId={co.id} />)}</div>
              : <p className="empty">{co.status === "founding" ? "ستظهر المستندات هنا بعد اكتمال خطوات التأسيس." : "أضف السجل التجاري والبطاقة الضريبية والتراخيص، وسنذكّرك قبل كل تجديد."}</p>}
          </section>
          <section className="panel">
            <div className="row between"><h2>طلبات قيد التنفيذ</h2><span className="note">تتحدث مع كل خطوة</span></div>
            {open.length ? open.map((r) => <ReqCard key={r.id} r={r} title={svcs[r.service_id]?.title || r.service_id} />) : <p className="empty">لا توجد طلبات قيد التنفيذ.</p>}
          </section>
        </div>
        <aside className="split-side">
          <section className="panel">
            <div className="row between"><h2>ملف الشركة</h2><span className="note">{num(fileCount)} ملف</span></div>
            {plan && <div className="meter" aria-hidden="true"><i style={{ width: `${Math.min(100, Math.round((used / plan.storage_bytes) * 100))}%` }} /></div>}
            {plan && <small className="note">{fmtSize(used)} من {fmtSize(plan.storage_bytes)} · الباقة {plan.title}</small>}
            <Link className="btn" href={`/companies/${co.id}/files`}>{fileCount ? "فتح ملف الشركة وإرساله" : "ارفع صور مستنداتك"}</Link>
          </section>
          <section className="panel">
            <div className="row between"><h2>آخر التحديثات</h2><Link className="link" href="/alerts">الكل</Link></div>
            {notes.length ? notes.map((n) => (
              <Link key={n.id} className="feed" href={pathFor(n.link || "#alerts")}>
                <span className={`dot ${feedTone(n.kind)}`} aria-hidden="true" />
                <span><b>{n.title}</b><small>{n.body || ""}{n.body ? " · " : ""}{fmtDate(n.created_at)}</small></span>
              </Link>
            )) : <p className="empty">لا توجد تحديثات بعد.</p>}
          </section>
          {toRate && (
            <section className="panel navy">
              <span className="tile-ic gold"><Icon name="star" /></span><h2>قيّم {toRate.offices?.name || "مقدم الخدمة"}</h2>
              <p>اكتمل {svcs[toRate.service_id]?.title || "طلبك"}. رأيك يساعد غيرك على الاختيار.</p>
              <Link className="btn gold" href={`/requests/${toRate.id}`}>قيّم الآن</Link>
            </section>
          )}
          {companies.length === 1 && (
            <section className="panel">
              <span className="tile-ic"><Icon name="plus" /></span><h2>لديك شركة أخرى؟</h2>
              <p className="note">أضفها وتابع مستنداتها من المكان نفسه.</p>
              <Link className="btn" href="/companies/new">إضافة شركة</Link>
            </section>
          )}
        </aside>
      </div>
    </>
  );
}

function DocCard({ x, companyId }: { x: any; companyId: string }) {
  const { d, svc, st, req, cls } = x;
  const label = { ok: "ساري", warn: "جدّد قريبًا", bad: "منتهي", busy: "قيد التجديد" }[cls];
  const pct = st.left === null ? 100 : st.left <= 0 ? 0 : Math.max(4, Math.min(100, Math.round((st.left / (svc?.validity_days || 365)) * 100)));
  const when = st.left === null ? "بلا تاريخ انتهاء" : st.left < 0 ? `انتهى منذ ${span(-st.left)}` : `ينتهي بعد ${span(st.left)}`;
  const href = req ? `/requests/${req.id}` : svc?.kind === "renewal" && cls !== "ok" ? `/renew/${d.id}` : `/companies/${companyId}`;
  return (
    <Link className={`doc-card ${cls}`} href={href}>
      <div className="row between"><b>{d.title}</b><span className={`chip stamp ${cls === "busy" ? "warn" : cls}`}>{label}</span></div>
      <div className="bar-v" aria-hidden="true"><i style={{ width: `${pct}%` }} /></div>
      <small>{when}{req ? ` · ${req.offices?.name || "تجدده بنفسك"}` : cls === "ok" && st.startOn ? ` · التذكير ${fmtDate(st.startOn)}` : ""}</small>
    </Link>
  );
}

function ReqCard({ r, title }: { r: any; title: string }) {
  const st = sortStages(r.request_stages);
  const cur = st.find((x) => !x.done_at), late = cur && ["accepted", "in_progress"].includes(r.status) ? stageLate(cur) : 0;
  const chip = r.status === "new" && r.office_id ? ["", "بانتظار رد مقدم الخدمة"] : late ? ["bad", `متأخر ${days(late)}`] : !r.office_id ? ["warn", "خطوة مطلوبة منك"] : ["ok", "في الموعد"];
  const seg = (x: typeof cur) => {
    if (x.done_at) return 100;
    if (x !== cur || !x.started_at) return 0;
    return Math.max(8, Math.min(92, Math.round(((Date.now() - new Date(x.started_at).getTime()) / (x.planned_days * DAY)) * 100)));
  };
  return (
    <Link className="req-card" href={`/requests/${r.id}`}>
      <div className="row">
        <Avatar name={r.offices?.name} self={!r.office_id} />
        <span className="grow"><b>{title}</b><small>{r.office_id ? r.offices?.name || "" : "تنفذه بنفسك"} · {money(r.quoted_fee)}</small></span>
        <span className={`chip ${chip[0]}`}>{chip[1]}</span>
      </div>
      {st.length > 0 && (
        <div className="segs">
          {st.map((x) => (
            <div key={x.idx} className={`seg ${x === cur ? (late ? "late" : "now") : x.done_at ? "done" : ""}`}>
              <span><i style={{ width: `${seg(x)}%` }} /></span><small>{x.title}</small>
            </div>
          ))}
        </div>
      )}
    </Link>
  );
}
