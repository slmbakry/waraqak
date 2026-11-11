"use client";
// The accuracy desk: error reports waiting for an answer, services whose facts need checking,
// and the record of what changed.
import { useEffect, useState } from "react";
import { sb } from "@/lib/supabase";
import { DAY, fmtDate, num } from "@/lib/format";
import { forgetCatalog, type FeePart, type Service } from "@/lib/data";
import SEED from "@/lib/seed-sources.json";
import { useLoad, useSession } from "../session";
import { Head, Kpi, LoadError, Loading } from "../ui";
import { CONFIDENCE } from "../Trust";

const STALE_DAYS = 180;
const KIND: Record<string, string> = { service: "خدمة", path: "مسار", activity: "نشاط مرخّص", obligation: "التزام دوري", registry: "دليل الأنشطة", other: "أخرى" };
const FIELD: Record<string, string> = { title: "الاسم", agency: "الجهة", gov_fee: "الرسوم الحكومية", self_days: "المدة", validity_days: "مدة السريان", docs: "المستندات",
  stages: "المراحل", sources: "المصادر", fee_note: "ملاحظة الرسم", fee_parts: "بنود الرسم", confidence: "درجة التأكد", reviewed_at: "تاريخ المراجعة", mode: "طريقة التقديم", category_id: "القسم", active: "الظهور" };
const short = (v: unknown) => { const t = v === null || v === undefined ? "فارغ" : typeof v === "object" ? (Array.isArray(v) ? `${num(v.length)} بند` : "…") : String(v); return t.length > 40 ? t.slice(0, 40) + "…" : t; };
const age = (d: string | null) => (d ? Math.floor((Date.now() - new Date(d).getTime()) / DAY) : Infinity);
type Svc = Service & { active: boolean };

export default function Accuracy() {
  const { toast } = useSession();
  const { data, error, reload } = useLoad(async () => {
    const [{ data: reports }, { data: svcs, error: e }, { data: changes }] = await Promise.all([
      sb.from("reports").select("*").order("created_at", { ascending: false }).limit(100),
      sb.from("services").select("*").order("sort"),
      sb.from("service_changes").select("*").order("changed_at", { ascending: false }).limit(30),
    ]);
    if (e) throw e;
    return { reports: reports || [], svcs: (svcs || []) as Svc[], changes: changes || [] };
  }, []);

  // Sources gathered in earlier research live in the code; copy them to the services that still have none.
  const missing = data?.svcs.filter((s) => !s.sources?.length && (SEED as Record<string, unknown>)[s.id]) || [];
  useEffect(() => {
    if (!missing.length) return;
    (async () => {
      for (const s of missing) await sb.from("services").update({ sources: (SEED as Record<string, unknown>)[s.id], confidence: "likely", reviewed_at: "2026-11-04" }).eq("id", s.id);
      forgetCatalog(); toast(`نقلنا مصادر ${num(missing.length)} خدمة من الأبحاث السابقة`); reload();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missing.length]);

  if (error) return <LoadError />;
  if (!data) return <Loading />;
  const { reports, svcs, changes } = data;
  const open = reports.filter((r) => r.status === "open");
  const titleOf = Object.fromEntries(svcs.map((s) => [s.id, s.title]));
  const stale = (s: Svc) => s.confidence !== "unverified" && age(s.reviewed_at) > STALE_DAYS;
  const queue = svcs.filter((s) => s.active).sort((a, b) => (a.confidence === "unverified" ? 0 : 1) - (b.confidence === "unverified" ? 0 : 1) || age(b.reviewed_at) - age(a.reviewed_at));

  const resolve = async (e: React.FormEvent<HTMLFormElement>, id: string, status: string) => {
    e.preventDefault();
    const reply = String(new FormData(e.currentTarget).get("reply") || "").trim() || null;
    const { error } = await sb.from("reports").update({ status, reply }).eq("id", id);
    if (error) return toast("تعذّر حفظ الرد", true);
    toast("تم الرد على البلاغ، ووصل صاحبه تنبيه"); reload();
  };

  return (
    <>
      <Head eyebrow="الدقة" title="ما نقوله صحيح، ونعرف من أين">
        <p>كل خدمة تحمل مصادرها وتاريخ آخر مراجعة ودرجة التأكد، وتظهر لمن يستخدمها. الخدمة التي تمر عليها {num(STALE_DAYS)} يومًا دون مراجعة تعود إلى رأس القائمة.</p>
      </Head>
      <div className="kpis">
        <Kpi ic="alert" tone={open.length ? "bad" : "ok"} value={open.length} label="بلاغات مفتوحة" />
        <Kpi ic="clock" tone="warn" value={svcs.filter((s) => s.active && s.confidence === "unverified").length} label="لم تُراجع بعد" />
        <Kpi ic="calendar" tone={svcs.some(stale) ? "warn" : ""} value={svcs.filter((s) => s.active && stale(s)).length} label="تحتاج مراجعة جديدة" />
        <Kpi ic="shield" tone="ok" value={svcs.filter((s) => s.active && s.confidence === "confirmed").length} label="مؤكدة" />
      </div>
      <section className="panel"><h2>بلاغات عن أخطاء</h2>
        {open.length ? open.map((r) => (
          <form key={r.id} className="fb-row" onSubmit={(e) => resolve(e, r.id, (e.nativeEvent as SubmitEvent).submitter?.getAttribute("value") || "fixed")}>
            <div className="row between"><b>{r.label}</b><span className="chip">{KIND[r.kind] || r.kind}</span></div>
            <p>{r.body}</p>
            <small className="note">{fmtDate(r.created_at)}{r.role ? ` · ${r.role === "office" ? "مقدم خدمة" : r.role === "owner" ? "صاحب عمل" : "مدير"}` : ""}{r.page ? " · " : ""}{r.page && <span className="ltr">{r.page}</span>}</small>
            <div className="field"><label htmlFor={`rr-${r.id}`}>ردك عليه (اختياري)</label><input id={`rr-${r.id}`} name="reply" maxLength={1000} /></div>
            <div className="row"><button className="btn primary small" type="submit" value="fixed">تم التصحيح</button><button className="btn small" type="submit" value="rejected">ليس خطأ</button></div>
          </form>
        )) : <p className="empty">لا توجد بلاغات مفتوحة.</p>}
      </section>
      <section className="panel"><h2>مراجعة الخدمات</h2>
        <p className="note">الأحوج إلى المراجعة أولًا. عدّل ما تغيّر، واكتب المصادر، ثم احفظ لتُسجَّل المراجعة بتاريخ اليوم.</p>
        {queue.map((s) => <Review key={s.id} s={s} stale={stale(s)} onSaved={() => { forgetCatalog(); toast("تم تسجيل المراجعة"); reload(); }} />)}
      </section>
      <section className="panel"><h2>آخر التغييرات</h2>
        {changes.length ? <div className="table-wrap"><table><thead><tr><th>الخدمة</th><th>ما تغيّر</th><th>من</th><th>إلى</th><th>التاريخ</th></tr></thead><tbody>
          {changes.map((c) => <tr key={c.id}><td>{titleOf[c.service_id] || c.service_id}</td><td>{FIELD[c.field] || c.field}</td><td>{short(c.old)}</td><td>{short(c.new)}</td><td>{fmtDate(c.changed_at)}</td></tr>)}
        </tbody></table></div> : <p className="empty">لم يتغير شيء بعد.</p>}
      </section>
    </>
  );
}

function Review({ s, stale, onSaved }: { s: Svc; stale: boolean; onSaved: () => void }) {
  const { toast } = useSession();
  const [tone, label] = CONFIDENCE[s.confidence] || CONFIDENCE.unverified;
  const save = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const sources = String(f.get("sources") || "").split("\n").map((l) => l.trim()).filter(Boolean).map((l) => { const i = l.lastIndexOf("|"); return i < 0 ? null : { title: l.slice(0, i).trim(), url: l.slice(i + 1).trim() }; });
    if (sources.some((x) => !x || !/^https?:\/\//.test(x.url) || !x.title)) return toast("اكتب كل مصدر في سطر: العنوان ثم | ثم الرابط", true);
    if (f.get("confidence") !== "unverified" && !sources.length) return toast("أضف مصدرًا واحدًا على الأقل قبل أن ترفع درجة التأكد", true);
    const validity = String(f.get("validity") || "");
    // One fee part per line: label | نسبة or ثابت | value | min | max | مؤكد or غير مؤكد | note
    const cell = (v?: string) => (v && v.trim() !== "" ? Number(v.trim()) : null);
    const parts: (FeePart | null)[] = String(f.get("parts") || "").split("\n").map((l) => l.trim()).filter(Boolean).map((l) => {
      const c = l.split("|").map((x) => x.trim());
      if (c.length < 2 || !c[0] || !["نسبة", "ثابت"].includes(c[1])) return null;
      return { label: c[0], kind: c[1] === "نسبة" ? "percent" : "fixed", value: cell(c[2]), min: cell(c[3]), max: cell(c[4]), sure: c[5] === "مؤكد", note: c[6] || null };
    });
    if (parts.some((x) => !x || (x.sure && x.value === null))) return toast("راجع بنود الرسم: كل سطر يبدأ بالاسم ثم نسبة أو ثابت، والبند المؤكد يحتاج قيمة", true);
    const { error } = await sb.from("services").update({ fee_note: String(f.get("fee_note") || "").trim() || null, fee_parts: parts, gov_fee: Number(f.get("fee") || 0), self_days: Number(f.get("days") || 0), validity_days: validity ? Number(validity) : null,
      confidence: f.get("confidence"), sources, review_note: String(f.get("note") || "").trim() || null, reviewed_at: new Date().toISOString().slice(0, 10) }).eq("id", s.id);
    if (error) return toast("تعذّر حفظ المراجعة", true);
    onSaved();
  };
  return (
    <details className="svc-edit">
      <summary><b>{s.title}</b><span className="chips">{stale && <span className="chip bad">مرّ عليها أكثر من {num(STALE_DAYS)} يومًا</span>}
        <span className={`chip ${tone}`}>{label}</span><span className="chip">{s.reviewed_at ? fmtDate(s.reviewed_at) : "بلا مراجعة"}</span></span></summary>
      <form className="stack" onSubmit={save}>
        <div className="form-row three">
          <div className="field"><label htmlFor={`af-${s.id}`}>الرسوم الحكومية بالجنيه</label><input id={`af-${s.id}`} name="fee" type="number" min="0" defaultValue={s.gov_fee} /></div>
          <div className="field"><label htmlFor={`ad-${s.id}`}>المدة إذا نفذها صاحب العمل بنفسه، بالأيام</label><input id={`ad-${s.id}`} name="days" type="number" min="0" defaultValue={s.self_days} /></div>
          <div className="field"><label htmlFor={`av-${s.id}`}>مدة السريان بالأيام</label><input id={`av-${s.id}`} name="validity" type="number" min="1" defaultValue={s.validity_days ?? ""} /></div>
        </div>
        <div className="field"><label htmlFor={`as-${s.id}`}>المصادر: سطر لكل مصدر، العنوان ثم | ثم الرابط</label>
          <textarea id={`as-${s.id}`} name="sources" rows={3} className="ltr-links" defaultValue={(s.sources || []).map((x) => `${x.title} | ${x.url}`).join("\n")} /></div>
        <div className="field"><label htmlFor={`afn-${s.id}`}>ملاحظة تظهر للمستخدم عن الرسم، إذا لم يكن رقمًا ثابتًا</label><input id={`afn-${s.id}`} name="fee_note" defaultValue={s.fee_note || ""} /></div>
        <div className="field"><label htmlFor={`afp-${s.id}`}>بنود الرسم للحاسبة: سطر لكل بند. الاسم | نسبة أو ثابت | القيمة | حد أدنى | حد أقصى | مؤكد أو غير مؤكد | ملاحظة</label>
          <textarea id={`afp-${s.id}`} name="parts" rows={3} defaultValue={(s.fee_parts || []).map((x) => [x.label, x.kind === "percent" ? "نسبة" : "ثابت", x.value ?? "", x.min ?? "", x.max ?? "", x.sure ? "مؤكد" : "غير مؤكد", x.note || ""].join(" | ")).join("\n")} />
          <small className="note">النسبة تُكتب في المائة: ربع في المائة تُكتب 0.25، وواحد في الألف تُكتب 0.1.</small></div>
        <div className="form-row two">
          <div className="field"><label htmlFor={`ac-${s.id}`}>درجة التأكد</label><select id={`ac-${s.id}`} name="confidence" defaultValue={s.confidence}>{Object.entries(CONFIDENCE).map(([k, v]) => <option key={k} value={k}>{v[1]}</option>)}</select></div>
          <div className="field"><label htmlFor={`an-${s.id}`}>ملاحظة داخلية عن المراجعة</label><input id={`an-${s.id}`} name="note" defaultValue={s.review_note || ""} /></div>
        </div>
        <button className="btn primary small" type="submit">حفظ وتسجيل المراجعة اليوم</button>
      </form>
    </details>
  );
}
