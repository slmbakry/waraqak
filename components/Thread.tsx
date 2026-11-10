"use client";
// The conversation inside a request: messages from both sides, files as they arrive, and the
// provider's requests for a missing document, which the owner answers by uploading it here.
import { useState } from "react";
import { sb } from "@/lib/supabase";
import { fmtDate } from "@/lib/format";
import { useSession } from "./session";
import { Icon } from "./ui";

type Ev = { id: number; actor_id: string | null; kind: string; note: string | null; created_at: string };
const KINDS = ["note", "file", "doc_request"];
const time = (d: string) => new Date(d).toLocaleTimeString("ar-EG", { hour: "numeric", minute: "2-digit" });

export default function Thread({ requestId, events, other, asOffice, closed, onChange }:
  { requestId: string; events: Ev[]; other: string; asOffice: boolean; closed?: boolean; onChange: () => void }) {
  const { uid, toast } = useSession();
  const [text, setText] = useState("");
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const list = events.filter((e) => KINDS.includes(e.kind));
  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const note = text.trim(); if (!note) return;
    setBusy(true);
    const { error } = await sb.from("events").insert({ request_id: requestId, actor_id: uid, kind: asking ? "doc_request" : "note", note });
    setBusy(false);
    if (error) return toast("تعذّر الإرسال، حاول مرة أخرى", true);
    setText(""); setAsking(false); onChange();
  };
  const upload = async (ev: React.ChangeEvent<HTMLInputElement>) => {
    const f = ev.target.files?.[0]; ev.target.value = ""; if (!f) return;
    if (f.size > 10 * 1024 * 1024) return toast("حجم الملف أكبر من ١٠ ميجابايت", true);
    const safe = f.name.replace(/[^\w.\-؀-ۿ]+/g, "_");
    setBusy(true);
    const { error } = await sb.storage.from("files").upload(`requests/${requestId}/${Date.now()}-${safe}`, f);
    if (!error) await sb.from("events").insert({ request_id: requestId, actor_id: uid, kind: "file", note: f.name });
    setBusy(false);
    if (error) return toast("تعذّر رفع الملف", true);
    toast("تم رفع الملف"); onChange();
  };
  return (
    <section className="panel thread">
      <div className="row between"><h2>الرسائل</h2><span className="note">بينك وبين {other}</span></div>
      {list.length ? (
        <ol className="msgs">
          {list.map((e, i) => {
            const mine = e.actor_id === uid, day = fmtDate(e.created_at), newDay = i === 0 || fmtDate(list[i - 1].created_at) !== day;
            return (
              <li key={e.id} className={`msg ${mine ? "mine" : ""} ${e.kind}`}>
                {newDay && <span className="msg-day">{day}</span>}
                <div className="bubble">
                  {e.kind === "doc_request" && <b><Icon name="doc" size={16} />مستند مطلوب</b>}
                  {e.kind === "file" && <b><Icon name="folder" size={16} />ملف مرفوع</b>}
                  <p>{e.note}</p>
                  {e.kind === "doc_request" && !asOffice && !closed && (
                    <label className="btn small">ارفع هذا المستند<input type="file" hidden disabled={busy} onChange={upload} /></label>
                  )}
                </div>
                <small className="note">{mine ? "أنت" : other} · {time(e.created_at)}</small>
              </li>
            );
          })}
        </ol>
      ) : <p className="empty">لا توجد رسائل بعد. اكتب ما تريد أن يعرفه {other}.</p>}
      {closed ? <small className="note">أُغلق هذا الطلب، ولا يمكن إرسال رسائل جديدة.</small> : (
        <form className="msg-form" onSubmit={send}>
          <label className="sr-only" htmlFor={`msg-${requestId}`}>{asking ? "اسم المستند المطلوب" : "رسالتك"}</label>
          <textarea id={`msg-${requestId}`} rows={2} maxLength={2000} required value={text} onChange={(e) => setText(e.target.value)}
            placeholder={asking ? "اسم المستند المطلوب، وأي تفاصيل عنه" : "اكتب رسالتك"} />
          <div className="row">
            <button className="btn primary small" type="submit" disabled={busy}>{asking ? "اطلب المستند" : "إرسال"}</button>
            {asOffice && <button className="linkish" type="button" onClick={() => setAsking(!asking)}>{asking ? "رسالة عادية" : "اطلب مستندًا ناقصًا"}</button>}
          </div>
        </form>
      )}
    </section>
  );
}
