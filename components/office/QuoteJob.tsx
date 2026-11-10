"use client";
// An open request for offers, as a provider sees it: the need without the company's name,
// and the provider's own offer, which it can change or withdraw until the owner chooses.
import { useState } from "react";
import { sb } from "@/lib/supabase";
import { fmtDate } from "@/lib/format";
import { OFFER_STATUS, type Service } from "@/lib/data";
import { useSession } from "../session";
import { Head } from "../ui";
import { NeedList, type Offer } from "../owner/Quote";

export default function QuoteJob({ r, s, mine, onChange }: { r: any; s: Service; mine: Offer | null; onChange: () => void }) {
  const { officeId, toast } = useSession();
  const [busy, setBusy] = useState(false);
  const locked = !!mine && mine.status !== "sent";
  const send = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const row = { fee: Number(f.get("fee")), days: Number(f.get("days")), terms: String(f.get("terms") || "").trim() || null, valid_until: String(f.get("valid") || "") || null };
    setBusy(true);
    const { error } = mine ? await sb.from("offers").update(row).eq("id", mine.id) : await sb.from("offers").insert({ ...row, request_id: r.id, office_id: officeId });
    setBusy(false);
    if (error) return toast("تعذّر إرسال العرض، حاول مرة أخرى", true);
    toast(mine ? "تم تحديث عرضك" : "أرسلنا عرضك إلى صاحب العمل"); onChange();
  };
  const withdraw = async () => {
    if (!confirm("هل تريد سحب عرضك؟ لن تستطيع إرسال عرض آخر على هذا الطلب.")) return;
    const { error } = await sb.from("offers").update({ status: "withdrawn" }).eq("id", mine.id);
    if (error) return toast("تعذّر سحب العرض", true);
    toast("تم سحب العرض"); onChange();
  };
  return (
    <>
      <Head back={["/", "الطلبات"]} eyebrow="طلب عرض سعر" title={s.title}>
        <p>اقرأ ما يحتاجه صاحب العمل، ثم أرسل سعرك ومدتك وشروطك. يظهر لك اسم الشركة وبياناتها إذا قبل عرضك.</p>
      </Head>
      <div className="split">
        <div className="split-main">
          <form className="panel" onSubmit={send}>
            <div className="row between"><h2>عرضك</h2>{mine && <span className={`chip ${OFFER_STATUS[mine.status][0]}`}>{OFFER_STATUS[mine.status][1]}</span>}</div>
            <div className="form-row two">
              <div className="field"><label htmlFor="of-fee">السعر الإجمالي بالجنيه</label><input id="of-fee" name="fee" type="number" min="0" step="50" required disabled={locked} defaultValue={mine?.fee ?? ""} /></div>
              <div className="field"><label htmlFor="of-days">مدة البدء والتسليم بالأيام</label><input id="of-days" name="days" type="number" min="1" required disabled={locked} defaultValue={mine?.days ?? ""} /></div>
            </div>
            <div className="field"><label htmlFor="of-terms">الشروط: ما يشمله السعر، وطريقة الدفع، وما تحتاجه من صاحب العمل</label>
              <textarea id="of-terms" name="terms" rows={5} maxLength={4000} disabled={locked} defaultValue={mine?.terms ?? ""} /></div>
            <div className="field"><label htmlFor="of-valid">العرض صالح حتى (اختياري)</label><input id="of-valid" name="valid" type="date" disabled={locked} defaultValue={mine?.valid_until ?? ""} /></div>
            {!locked && <div className="row"><button className="btn primary" type="submit" disabled={busy}>{mine ? "تحديث العرض" : "إرسال العرض"}</button>
              {mine && <button className="btn danger small" type="button" onClick={withdraw}>سحب العرض</button>}</div>}
            <small className="note">إذا قبل صاحب العمل عرضك، يصبح بسعره ومدته وشروطه هو الاتفاق، ولا يمكن تعديله بعدها.</small>
          </form>
        </div>
        <aside className="split-side">
          <section className="panel"><h2>ما يحتاجه صاحب العمل</h2><NeedList fields={s.need_fields || []} need={r.need} />
            <small className="note">أُرسل الطلب في {fmtDate(r.created_at)}</small></section>
          {s.docs?.length > 0 && <section className="panel"><div className="docs"><b>المستندات المتوقعة من صاحب العمل</b><ul>{s.docs.map((d) => <li key={d}>{d}</li>)}</ul></div></section>}
        </aside>
      </div>
    </>
  );
}
