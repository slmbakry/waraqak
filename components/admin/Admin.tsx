"use client";
// Admin screens: overview, office performance, invites, offices and their prices, users.
import Link from "next/link";
import { useState } from "react";
import { sb } from "@/lib/supabase";
import { DAY, days, fmtDate, money, num } from "@/lib/format";
import { categories, services, sortStages, stageLate } from "@/lib/data";
import { PROVIDER_KINDS } from "../Provider";
import { readSession, writeSession } from "@/lib/storage";
import { fmtSize } from "@/lib/files";
import { useLoad, useSession } from "../session";
import { Head, Kpi, LoadError, Loading } from "../ui";


const ROLES = { owner: "صاحب عمل", office: "مقدم خدمة", admin: "مدير" };
const WAIT_DAYS = 1;
const since = (t: string) => (Date.now() - new Date(t).getTime()) / DAY;

// Real data only by default; the admin can include preview data.
function useDemo(): [boolean, (v: boolean) => void] {
  const [on, setOn] = useState(() => readSession("rasmy-admin-demo") === "1");
  return [on, (v) => { writeSession("rasmy-admin-demo", v ? "1" : "0"); setOn(v); }];
}
function DemoSwitch({ on, set }: { on: boolean; set: (v: boolean) => void }) {
  return (
    <div className="tabs" role="tablist">
      <button className="tab" type="button" role="tab" aria-selected={!on} onClick={() => set(false)}>البيانات الحقيقية</button>
      <button className="tab" type="button" role="tab" aria-selected={on} onClick={() => set(true)}>مع التجريبية</button>
    </div>
  );
}

async function loadRequests(demo: boolean) {
  let q = sb.from("requests").select("*, offices(name), companies(name), request_stages(idx,title,planned_days,started_at,done_at)").order("created_at", { ascending: false });
  if (!demo) q = q.eq("is_demo", false);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map(measure);
}

// Lateness of one request: on its current stage, and against the time the office promised.
function measure(r) {
  const cur = sortStages(r.request_stages).find((x) => !x.done_at);
  const open = ["accepted", "in_progress"].includes(r.status);
  const start = r.accepted_at || r.created_at;
  const took = r.completed_at ? since(start) - since(r.completed_at) : null;
  return { ...r, stage: cur, stageLate: open && cur ? stageLate(cur) : 0,
    overdue: open && r.quoted_days ? Math.max(0, Math.floor(since(start) - r.quoted_days)) : 0,
    waiting: r.status === "new" && r.office_id ? Math.floor(since(r.created_at)) : 0,
    took, onTime: took === null ? null : took <= (r.quoted_days || 0) + 0.5 };
}

export function AdminHome() {
  const [demo, setDemo] = useDemo();
  const { data, error } = useLoad(async () => {
    const count = async (t: string, f?: (q: any) => any) => { let q = sb.from(t).select("*", { count: "exact", head: true }); if (f) q = f(q); const { count: c } = await q; return c ?? 0; };
    const [svcs, reqs, users, pending] = await Promise.all([services(), loadRequests(demo), count("profiles"), count("invites", (q) => q.is("accepted_at", null))]);
    return { svcs, reqs, users, pending };
  }, [demo]);
  const head = (
    <Head eyebrow="لوحة المدير" title="نظرة سريعة">
      <p>هنا ترى الطلبات المتأخرة ومقدمي الخدمة الذين لم يردوا بعد. ويمكنك أيضًا تجربة المنصة كصاحب عمل أو كمقدم خدمة من الشريط في الأعلى.</p>
      <DemoSwitch on={demo} set={setDemo} />
    </Head>
  );
  if (error) return <>{head}<LoadError /></>;
  if (!data) return <>{head}<Loading /></>;
  const { svcs, reqs, users, pending } = data;
  const late = reqs.filter((r) => r.stageLate || r.overdue).sort((a, b) => Math.max(b.stageLate, b.overdue) - Math.max(a.stageLate, a.overdue));
  const waiting = reqs.filter((r) => r.waiting >= WAIT_DAYS).sort((a, b) => b.waiting - a.waiting);
  const open = reqs.filter((r) => !["done", "cancelled"].includes(r.status));
  const done = reqs.filter((r) => r.status === "done" && r.office_id);
  const onTime = done.length ? Math.round((done.filter((r) => r.onTime).length / done.length) * 100) : null;
  const title = (r) => svcs[r.service_id]?.title || r.service_id;
  const who = (r) => r.offices?.name || "صاحب العمل بنفسه";
  return (
    <>
      {head}
      <div className="kpis">
        <Kpi ic="list" value={open.length} label="طلب مفتوح" />
        <Kpi ic="alert" tone={late.length ? "bad" : "ok"} value={late.length} label="طلب متأخر" />
        <Kpi ic="clock" tone={waiting.length ? "warn" : "ok"} value={waiting.length} label="بانتظار رد مقدم الخدمة" />
        <Kpi ic="check" tone="ok" value={onTime === null ? "—" : num(onTime) + "٪"} label="اكتملت في موعدها" />
        <Kpi ic="users" value={users} label="مستخدم" />
        <Kpi ic="mail" value={pending} label="دعوة معلّقة" />
      </div>
      <section className="panel">
        <div className="row between"><h2>طلبات متأخرة</h2><Link className="btn small" href="/admin/performance">أداء مقدمي الخدمة</Link></div>
        {late.length ? <div className="reqs">{late.map((r) => (
          <Link key={r.id} className="req late" href={`/requests/${r.id}`}>
            <div className="row between"><b>{title(r)}</b><span className="chips">{r.escalated_at && <span className="chip warn">تم التصعيد</span>}<span className="chip bad">متأخر {days(Math.max(r.stageLate, r.overdue))}</span></span></div>
            <small>{r.companies?.name || ""} · {who(r)}{r.stage ? " · المرحلة الحالية: " + r.stage.title : ""}</small>
            <small>{r.overdue ? `تجاوز المدة المعلنة بـ${days(r.overdue)}` : ""}{r.overdue && r.stageLate ? " · " : ""}{r.stageLate ? `المرحلة متأخرة ${days(r.stageLate)}` : ""}</small>
          </Link>
        ))}</div> : <p className="empty">لا توجد طلبات متأخرة.</p>}
      </section>
      <section className="panel"><h2>مقدمو خدمة لم يردوا على طلبات</h2>
        {waiting.length ? <div className="reqs">{waiting.map((r) => (
          <Link key={r.id} className="req" href={`/requests/${r.id}`}>
            <div className="row between"><b>{title(r)}</b><span className="chips">{r.escalated_at && <span className="chip bad">تم التصعيد</span>}<span className="chip warn">ينتظر منذ {days(r.waiting)}</span></span></div>
            <small>{r.companies?.name || ""} · {who(r)}</small>
          </Link>
        ))}</div> : <p className="empty">ردّ جميع مقدمي الخدمة على طلباتهم.</p>}
      </section>
    </>
  );
}

export function Performance() {
  const [demo, setDemo] = useDemo();
  const { data, error } = useLoad(async () => {
    const [reqs, { data: offs }, { data: ratings }, { data: declines }] = await Promise.all([
      loadRequests(demo),
      sb.from("offices").select("id,name,active,is_demo").order("name"),
      sb.from("ratings").select("office_id,professionalism,speed,request_id"),
      sb.from("events").select("request_id").eq("kind", "declined"),
    ]);
    const declined = new Set((declines || []).map((e) => e.request_id));
    const ids = new Set(reqs.map((r) => r.id));
    const avg = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
    return (offs || []).filter((o) => demo || !o.is_demo).map((o) => {
      const mine = reqs.filter((r) => r.office_id === o.id);
      const answered = mine.filter((r) => r.accepted_at || declined.has(r.id));
      const accepted = mine.filter((r) => r.accepted_at);
      const done = mine.filter((r) => r.status === "done");
      const timed = done.filter((r) => r.onTime !== null);
      const rs = (ratings || []).filter((x) => x.office_id === o.id && ids.has(x.request_id));
      return { o, total: mine.length,
        open: mine.filter((r) => ["new", "accepted", "in_progress"].includes(r.status)).length,
        late: mine.filter((r) => r.stageLate || r.overdue).length,
        done: done.length,
        acceptRate: answered.length ? accepted.length / answered.length : null,
        reply: avg(accepted.map((r) => since(r.created_at) - since(r.accepted_at))),
        onTime: timed.length ? timed.filter((r) => r.onTime).length / timed.length : null,
        delay: avg(timed.filter((r) => !r.onTime).map((r) => r.took - r.quoted_days)),
        pro: avg(rs.map((x) => x.professionalism)), speed: avg(rs.map((x) => x.speed)) };
    }).sort((a, b) => b.total - a.total);
  }, [demo]);
  const pct = (v: number | null) => (v === null ? "—" : num(Math.round(v * 100)) + "٪");
  const dur = (v: number | null) => (v === null ? "—" : v < 1 ? "أقل من يوم" : days(Math.round(v)));
  const star = (v: number | null) => (v === null ? "—" : num(v.toFixed(1)));
  return (
    <>
      <Head back={["/", "الرئيسية"]} eyebrow="أداء مقدمي الخدمة" title="من يلتزم بمواعيده">
        <p>تُحسب هذه الأرقام من تواريخ الطلبات نفسها، لا من آراء الأشخاص. ويعني الالتزام بالموعد أن الطلب اكتمل في المدة التي أعلنها مقدم الخدمة أو أقل.</p>
        <DemoSwitch on={demo} set={setDemo} />
      </Head>
      {error ? <LoadError /> : !data ? <Loading /> : (
        <section className="panel"><div className="table-wrap">{data.length ? (
          <table><thead><tr><th>مقدم الخدمة</th><th>الطلبات</th><th>مفتوح</th><th>متأخر الآن</th><th>مكتمل</th><th>نسبة القبول</th><th>متوسط وقت الرد</th><th>في الموعد</th><th>متوسط التأخير</th><th>الاحترافية</th><th>السرعة</th></tr></thead>
            <tbody>{data.map((x) => (
              <tr key={x.o.id}>
                <td>{x.o.name}{!x.o.active && <> <span className="chip">موقوف</span></>}{x.o.is_demo && <> <span className="chip">تجريبي</span></>}</td>
                <td>{num(x.total)}</td><td>{num(x.open)}</td>
                <td>{x.late ? <span className="chip bad">{num(x.late)}</span> : num(0)}</td><td>{num(x.done)}</td><td>{pct(x.acceptRate)}</td><td>{dur(x.reply)}</td>
                <td>{x.onTime === null ? "—" : <span className={`chip ${x.onTime >= 0.8 ? "ok" : x.onTime >= 0.5 ? "warn" : "bad"}`}>{pct(x.onTime)}</span>}</td>
                <td>{dur(x.delay)}</td><td>{star(x.pro)}</td><td>{star(x.speed)}</td>
              </tr>
            ))}</tbody></table>
        ) : <p className="empty">لا يوجد مقدمو خدمة بعد.</p>}</div>
          <p className="note">التقييمات من أصحاب العمل بعد اكتمال الطلب.</p></section>
      )}
    </>
  );
}

export function Invites() {
  const { profile, toast } = useSession();
  const [role, setRole] = useState("owner");
  const { data, error, reload } = useLoad(async () => {
    const [{ data: offices }, { data: list, error }] = await Promise.all([
      sb.from("offices").select("id,name").order("name"),
      sb.from("invites").select("email,role,created_at,accepted_at,offices(name)").order("created_at", { ascending: false }),
    ]);
    return { offices: offices || [], list, failed: !!error };
  }, []);
  const add = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget, f = new FormData(form);
    const row = { email: String(f.get("email")).trim().toLowerCase(), role, invited_by: profile.id,
      office_id: role === "office" ? String(f.get("office") || "") || null : null };
    if (row.role === "office" && !row.office_id) return toast("أضف مقدم الخدمة أولًا من صفحة مقدمي الخدمة", true);
    const { error } = await sb.from("invites").insert(row);
    if (error) return toast(error.code === "23505" ? "هذا البريد مدعو من قبل" : "تعذّرت إضافة الدعوة", true);
    toast("تمت إضافة الدعوة"); form.reset(); setRole("owner"); reload();
  };
  return (
    <>
      <Head eyebrow="الدعوات" title="من يمكنه دخول المنصة"><p>تحدد الدعوة دور الشخص. أرسل إليه رابط الموقع، وعندما يدخل ببريده سيحصل على هذا الدور تلقائيًا.</p></Head>
      <section className="panel">
        <h2>دعوة جديدة</h2>
        <form className="form-row" onSubmit={add}>
          <div className="field"><label htmlFor="inv-email">البريد</label><input id="inv-email" name="email" type="email" className="ltr" required /></div>
          <div className="field"><label htmlFor="inv-role">الدور</label>
            <select id="inv-role" value={role} onChange={(e) => setRole(e.target.value)}><option value="owner">صاحب عمل</option><option value="office">مقدم خدمة</option><option value="admin">مدير</option></select></div>
          <div className="field" hidden={role !== "office"}><label htmlFor="inv-office">مقدم الخدمة</label>
            <select id="inv-office" name="office">{(data?.offices || []).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></div>
          <button className="btn primary" type="submit">أضف الدعوة</button>
        </form>
      </section>
      <section className="panel"><h2>كل الدعوات</h2><div className="table-wrap">
        {error || data?.failed ? <p className="empty">تعذّر تحميل الدعوات</p> : !data ? <Loading /> : data.list.length ? (
          <table><thead><tr><th>البريد</th><th>الدور</th><th>مقدم الخدمة</th><th>الحالة</th></tr></thead><tbody>
            {data.list.map((i: any) => (
              <tr key={i.email}><td className="ltr">{i.email}</td><td>{ROLES[i.role]}</td><td>{i.offices?.name || ""}</td>
                <td>{i.accepted_at ? <span className="chip ok">دخل {fmtDate(i.accepted_at)}</span> : <span className="chip warn">معلّقة</span>}</td></tr>
            ))}
          </tbody></table>
        ) : <p className="empty">لا توجد دعوات بعد</p>}
      </div></section>
    </>
  );
}

export function Offices() {
  const { toast } = useSession();
  const { data, error, reload } = useLoad(async () => {
    const { data, error } = await sb.from("offices").select("*, office_services(count), office_contacts(phone)").order("created_at");
    if (error) throw error;
    return data;
  }, []);
  const add = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget, f = new FormData(form);
    const val = (k: string) => String(f.get(k) || "").trim() || null;
    const { data: o, error } = await sb.from("offices").insert({ name: val("name"), kind: val("kind"), license_no: val("license"), verified: !!val("license") }).select("id").single();
    if (error) return toast("تعذّرت إضافة مقدم الخدمة", true);
    if (val("phone")) await sb.from("office_contacts").insert({ office_id: o.id, phone: val("phone") });
    toast("تمت إضافة مقدم الخدمة"); form.reset(); reload();
  };
  const verify = async (id: string, verified: boolean) => {
    const { error } = await sb.from("offices").update({ verified }).eq("id", id);
    if (error) return toast("تعذّر حفظ التوثيق", true);
    toast(verified ? "تم توثيق مقدم الخدمة" : "أُلغي التوثيق"); reload();
  };
  return (
    <>
      <Head eyebrow="مقدمو الخدمة" title="مقدمو الخدمة المعتمدون"><p>أضف مقدم الخدمة، وحدد أسعاره ومدده لكل خدمة، ثم أرسل دعوة لموظفيه بدور مقدم خدمة.</p></Head>
      <section className="panel">
        <h2>مقدم خدمة جديد</h2>
        <form className="form-row five" onSubmit={add}>
          <div className="field"><label htmlFor="off-name">الاسم</label><input id="off-name" name="name" required /></div>
          <div className="field"><label htmlFor="off-kind">النوع</label><select id="off-kind" name="kind">
            {Object.entries(PROVIDER_KINDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
          <div className="field"><label htmlFor="off-phone">الهاتف</label><input id="off-phone" name="phone" className="ltr" inputMode="tel" /></div>
          <div className="field"><label htmlFor="off-lic">رقم الترخيص</label><input id="off-lic" name="license" className="ltr" /></div>
          <button className="btn primary" type="submit">إضافة</button>
        </form>
      </section>
      <section className="panel"><h2>كل مقدمي الخدمة</h2><div className="table-wrap">
        {error ? <p className="empty">تعذّر تحميل مقدمي الخدمة</p> : !data ? <Loading /> : data.length ? (
          <table><thead><tr><th>مقدم الخدمة</th><th>النوع</th><th>الهاتف</th><th>رقم الترخيص</th><th>خدمات مسعّرة</th><th>التوثيق</th><th></th></tr></thead><tbody>
            {data.map((o) => (
              <tr key={o.id}><td>{o.name}</td><td>{PROVIDER_KINDS[o.kind] || o.kind || ""}</td><td className="ltr">{o.office_contacts?.phone || o.office_contacts?.[0]?.phone || ""}</td><td className="ltr">{o.license_no || ""}</td>
                <td>{num(o.office_services?.[0]?.count || 0)}</td><td><button className={"chip " + (o.verified ? "ok" : "warn")} type="button" onClick={() => verify(o.id, !o.verified)}>{o.verified ? "موثّق" : "غير موثّق"}</button></td><td><Link className="btn small" href={`/admin/offices/${o.id}/prices`}>الأسعار والمدد</Link></td></tr>
            ))}
          </tbody></table>
        ) : <p className="empty">لا يوجد مقدمو خدمة بعد. ابدأ بإضافة الشريك الأول.</p>}
      </div></section>
    </>
  );
}

export function Prices({ officeId }: { officeId: string }) {
  const { toast } = useSession();
  const { data, error } = useLoad(async () => {
    const [{ data: office }, all, cats, { data: rows }] = await Promise.all([
      sb.from("offices").select("id,name").eq("id", officeId).maybeSingle(),
      services(), categories(),
      sb.from("office_services").select("service_id,fee,days").eq("office_id", officeId),
    ]);
    // Services priced per request have no published price to set here.
    const svcs = Object.fromEntries(Object.entries(all).filter(([, x]) => x.mode === "procedure"));
    return { office, svcs, catOf: Object.fromEntries(cats.map((c) => [c.id, c.title])), cur: Object.fromEntries((rows || []).map((r) => [r.service_id, r])) };
  }, [officeId]);
  if (error) return <LoadError />;
  if (!data) return <Loading />;
  const { office, svcs, cur, catOf } = data;
  if (!office) return <section className="panel"><p>مقدم الخدمة هذا غير موجود.</p><Link className="btn" href="/admin/offices">العودة إلى مقدمي الخدمة</Link></section>;
  const save = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const upserts = [];
    for (const s of Object.values(svcs)) {
      const fee = String(f.get("fee-" + s.id)), d = String(f.get("days-" + s.id));
      if (fee !== "" && d !== "") upserts.push({ office_id: officeId, service_id: s.id, fee: Number(fee), days: Number(d) });
    }
    if (!upserts.length) return toast("اكتب سعر ومدة لخدمة واحدة على الأقل", true);
    const { error } = await sb.from("office_services").upsert(upserts);
    if (error) return toast("تعذّر حفظ الأسعار", true);
    toast("تم حفظ الأسعار");
  };
  return (
    <>
      <Head back={["/admin/offices", "مقدمو الخدمة"]} eyebrow="الأسعار والمدد" title={office.name}>
        <p>اكتب أتعاب مقدم الخدمة ومدته لكل خدمة يقدمها. الخدمة التي تتركها فارغة لن تظهر لصاحب العمل مع مقدم الخدمة هذا. وتُحسب الرسوم الحكومية تلقائيًا.</p>
      </Head>
      <form className="panel" onSubmit={save}>
        <div className="table-wrap"><table className="prices"><thead><tr><th>الخدمة</th><th>الرسوم الحكومية</th><th>الأتعاب بالجنيه</th><th>المدة بالأيام</th></tr></thead><tbody>
          {Object.values(svcs).map((s) => (
            <tr key={s.id}><td>{s.title}<br /><small className="note">{catOf[s.category_id] || ""}</small></td><td>{money(s.gov_fee)}</td>
              <td><input className="mini" type="number" min="0" step="50" name={`fee-${s.id}`} defaultValue={cur[s.id]?.fee ?? ""} /></td>
              <td><input className="mini" type="number" min="1" step="1" name={`days-${s.id}`} defaultValue={cur[s.id]?.days ?? ""} /></td></tr>
          ))}
        </tbody></table></div>
        <button className="btn primary" type="submit">حفظ الأسعار</button>
      </form>
    </>
  );
}

export function Users() {
  const { data, error } = useLoad(async () => {
    const { data, error } = await sb.from("profiles").select("email,role,consent_at,created_at,offices(name)").order("created_at", { ascending: false });
    if (error) throw error;
    return data as any[];
  }, []);
  return (
    <>
      <Head eyebrow="المستخدمون" title="من دخلوا المنصة" />
      <section className="panel"><div className="table-wrap">
        {error ? <p className="empty">تعذّر تحميل المستخدمين</p> : !data ? <Loading /> : (
          <table><thead><tr><th>البريد</th><th>الدور</th><th>مقدم الخدمة</th><th>الموافقة على البيانات</th><th>أول دخول</th></tr></thead><tbody>
            {data.map((u) => (
              <tr key={u.email}><td className="ltr">{u.email}</td><td>{u.role ? ROLES[u.role] : <span className="chip warn">غير مدعو</span>}</td>
                <td>{u.offices?.name || ""}</td><td>{u.consent_at ? fmtDate(u.consent_at) : "لم يوافق بعد"}</td><td>{fmtDate(u.created_at)}</td></tr>
            ))}
          </tbody></table>
        )}
      </div></section>
    </>
  );
}

// Companies and their plans. Until payments arrive, the admin sets each company's plan.
export function Companies() {
  const { toast } = useSession();
  const [demo, setDemo] = useDemo();
  const { data, error, reload } = useLoad(async () => {
    let q = sb.from("companies").select("id,name,plan,is_demo,created_at,owner_id").order("created_at", { ascending: false });
    if (!demo) q = q.eq("is_demo", false);
    const [{ data: list, error }, { data: plans }] = await Promise.all([q, sb.from("plans").select("id,title,storage_bytes").order("sort")]);
    if (error) throw error;
    const [used, { data: people }] = await Promise.all([
      Promise.all((list || []).map((c) => sb.rpc("company_usage", { cid: c.id }).then((r) => Number(r.data || 0)))),
      sb.from("profiles").select("id,email").in("id", [...new Set((list || []).map((c) => c.owner_id))]),
    ]);
    const email = Object.fromEntries((people || []).map((p) => [p.id, p.email]));
    return { list: (list || []).map((c, i) => ({ ...c, used: used[i], email: email[c.owner_id] })) as any[], plans: plans || [] };
  }, [demo]);
  const setPlan = async (id: string, plan: string) => {
    const { error } = await sb.from("companies").update({ plan }).eq("id", id);
    if (error) return toast("تعذّر تغيير الباقة", true);
    toast("تم تغيير الباقة"); reload();
  };
  return (
    <>
      <Head eyebrow="الشركات" title="الشركات وباقاتها">
        <p>الباقة تحدد مساحة تخزين ملفات الشركة وجودة الصور. إلى أن يعمل الدفع الإلكتروني، يمكنك تغيير باقة أي شركة من هنا.</p>
        <DemoSwitch on={demo} set={setDemo} />
      </Head>
      <section className="panel"><div className="table-wrap">
        {error ? <p className="empty">تعذّر تحميل الشركات</p> : !data ? <Loading /> : data.list.length ? (
          <table><thead><tr><th>الشركة</th><th>صاحب العمل</th><th>المساحة المستخدمة</th><th>الباقة</th></tr></thead><tbody>
            {data.list.map((c) => {
              const lim = data.plans.find((p) => p.id === c.plan)?.storage_bytes || 1;
              return (
                <tr key={c.id}><td>{c.name}{c.is_demo && <> <span className="chip">تجريبي</span></>}</td>
                  <td className="ltr">{c.email || ""}</td>
                  <td>{fmtSize(c.used)} <small className="note">({num(Math.round((c.used / lim) * 100))}٪)</small></td>
                  <td><select value={c.plan} onChange={(e) => setPlan(c.id, e.target.value)}>{data.plans.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}</select></td></tr>
              );
            })}
          </tbody></table>
        ) : <p className="empty">لا توجد شركات بعد.</p>}
      </div></section>
    </>
  );
}

// Notes sent from the feedback button, newest first.
export function FeedbackList() {
  const { toast } = useSession();
  const [n, setN] = useState(0);
  const { data, error } = useLoad(async () => {
    const { data } = await sb.from("feedback").select("*").order("created_at", { ascending: false }).limit(200);
    return data || [];
  }, [n]);
  if (error) return <LoadError />;
  if (!data) return <Loading />;
  const mark = async (id: string, done: boolean) => {
    const { error: e } = await sb.from("feedback").update({ done_at: done ? new Date().toISOString() : null }).eq("id", id);
    if (e) return toast("تعذّر الحفظ", true);
    setN((x) => x + 1);
  };
  const open = data.filter((f) => !f.done_at).length;
  return (
    <>
      <Head eyebrow="المدير" title="ملاحظات المستخدمين"><p>{open ? `${num(open)} ملاحظة لم تُراجع بعد.` : "لا توجد ملاحظات جديدة."}</p></Head>
      <section className="panel">
        {data.length ? data.map((f) => (
          <div key={f.id} className={"fb-row" + (f.done_at ? " done" : "")}>
            <p>{f.body}</p>
            <small className="note"><span className="ltr">{f.email}</span> · {ROLES[f.role as keyof typeof ROLES] || ""} · <span className="ltr">{f.page}</span> · {fmtDate(f.created_at)}</small>
            <button className="linkish" type="button" onClick={() => mark(f.id, !f.done_at)}>{f.done_at ? "إعادتها كجديدة" : "تمت المراجعة"}</button>
          </div>
        )) : <p className="note">لم تصل أي ملاحظة بعد.</p>}
      </section>
    </>
  );
}
