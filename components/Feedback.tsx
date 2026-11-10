"use client";
// A floating "your notes" button: anyone signed in can tell us what they
// think, and the page they were on is sent with it.
import { usePathname } from "next/navigation";
import { useState } from "react";
import { sb } from "@/lib/supabase";
import { useSession } from "./session";
import { Icon } from "./ui";

export default function FeedbackButton() {
  const { role, toast } = useSession();
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const send = async () => {
    const body = text.trim();
    if (!body) return toast("اكتب ملاحظتك أولًا", true);
    setBusy(true);
    const { error } = await sb.from("feedback").insert({ body, role, page: path });
    setBusy(false);
    if (error) return toast("تعذّر إرسال الملاحظة، حاول مرة أخرى", true);
    setText(""); setOpen(false); toast("وصلتنا ملاحظتك، شكرًا لك");
  };
  return (
    <>
      <button className="fb-btn" type="button" onClick={() => setOpen(true)} aria-haspopup="dialog"><Icon name="chat" size={18} /><span>ملاحظاتك</span></button>
      {open && (
        <div className="fb-back" role="presentation" onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
          <section className="panel fb-box" role="dialog" aria-modal="true" aria-labelledby="fb-t">
            <h2 id="fb-t">ملاحظاتك تهمنا</h2>
            <p className="note">ما الذي أعجبك، وما الذي لم يكن واضحًا، وما الذي تتمنى أن تجده؟ سنعرف الصفحة التي كتبت منها.</p>
            <div className="field">
              <label htmlFor="fb-text" className="sr-only">ملاحظتك</label>
              <textarea id="fb-text" rows={5} value={text} onChange={(e) => setText(e.target.value)} maxLength={4000} autoFocus />
            </div>
            <div className="row">
              <button className="btn primary" type="button" disabled={busy} onClick={send}>إرسال</button>
              <button className="btn" type="button" onClick={() => setOpen(false)}>إلغاء</button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
