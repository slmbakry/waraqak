"use client";
// How far a service's facts can be trusted: where they come from, when they were last
// checked, and a way to report an error on this exact item.
import { usePathname } from "next/navigation";
import { useState } from "react";
import { sb } from "@/lib/supabase";
import { fmtDate } from "@/lib/format";
import { services } from "@/lib/data";
import { useLoad, useSession } from "./session";
import FeeCalc from "./FeeCalc";

export const CONFIDENCE: Record<string, [string, string, string]> = {
  confirmed: ["ok", "مؤكد", "تأكدنا منه من الجهة نفسها أو من تنفيذ فعلي."],
  likely: ["", "مراجَع من مصادر منشورة", "راجعناه من القوانين والمصادر المنشورة، ولم نؤكده من الجهة بعد."],
  unverified: ["warn", "لم يُراجع بعد", "هذه المعلومات تقديرية حتى نراجعها. تأكد من الجهة قبل أن تعتمد عليها."],
};

export function ReportButton({ kind, refId, label }: { kind: string; refId: string; label: string }) {
  const { role, toast } = useSession();
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const send = async () => {
    const body = text.trim();
    if (body.length < 3) return toast("اكتب ما وجدته خطأ، وما الصحيح إن كنت تعرفه", true);
    setBusy(true);
    const { error } = await sb.from("reports").insert({ kind, ref: refId, label: label.slice(0, 200), body, role, page: path });
    setBusy(false);
    if (error) return toast("تعذّر إرسال البلاغ، حاول مرة أخرى", true);
    setText(""); setOpen(false); toast("وصلنا بلاغك، وسنخبرك بنتيجة مراجعته");
  };
  return (
    <>
      <button className="linkish report" type="button" onClick={() => setOpen(true)} aria-haspopup="dialog">وجدت خطأ؟ بلّغنا</button>
      {open && (
        <div className="fb-back" role="presentation" onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
          <section className="panel fb-box" role="dialog" aria-modal="true" aria-label="بلاغ عن خطأ">
            <h2>بلاغ عن خطأ</h2>
            <p className="note">عن: {label}</p>
            <div className="field"><label htmlFor="rp-text">ما الخطأ؟ وما الصحيح إن كنت تعرفه؟</label>
              <textarea id="rp-text" rows={4} maxLength={2000} value={text} onChange={(e) => setText(e.target.value)} autoFocus /></div>
            <div className="row"><button className="btn primary" type="button" disabled={busy} onClick={send}>إرسال البلاغ</button>
              <button className="btn" type="button" onClick={() => setOpen(false)}>إلغاء</button></div>
          </section>
        </div>
      )}
    </>
  );
}

export default function Trust({ serviceId }: { serviceId: string }) {
  const { data: s } = useLoad(async () => (await services())[serviceId] || null, [serviceId]);
  if (!s) return null;
  const [tone, label, hint] = CONFIDENCE[s.confidence] || CONFIDENCE.unverified;
  return (
    <div className="trust">
      {s.fee_note && <p className="fee-note"><b>عن الرسوم الحكومية: </b>{s.fee_note}</p>}
      {s.fee_parts?.length > 0 && <FeeCalc parts={s.fee_parts} />}
      <div className="row"><span className={`chip ${tone}`}>{label}</span>
        <small className="note">{s.reviewed_at ? `آخر مراجعة ${fmtDate(s.reviewed_at)}` : "لم تُسجَّل مراجعة"}</small></div>
      <small className="note">{hint}</small>
      {s.sources?.length > 0 && (
        <details><summary>المصادر ({s.sources.length.toLocaleString("ar-EG")})</summary>
          <ul className="sources">{s.sources.map((x) => <li key={x.url}><a href={x.url} target="_blank" rel="noopener noreferrer">{x.title}</a></li>)}</ul>
        </details>
      )}
      <ReportButton kind="service" refId={s.id} label={s.title} />
    </div>
  );
}
