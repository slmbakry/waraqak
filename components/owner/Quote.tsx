"use client";
// Services priced per request: the owner states the need, providers answer with offers,
// and the offer the owner accepts becomes the agreement.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { sb } from "@/lib/supabase";
import { days, fmtDate, money, num } from "@/lib/format";
import { services, type NeedField } from "@/lib/data";
import { useCompanies } from "../companies";
import { useLoad, useSession } from "../session";
import { Avatar, Head, Icon, LoadError, Loading } from "../ui";
import { ProviderInfo } from "../Provider";

export function QuoteStart({ serviceId }: { serviceId: string }) {
  const router = useRouter();
  const { uid, isPreview, toast } = useSession();
  const { list, current } = useCompanies();
  const [busy, setBusy] = useState(false);
  const { data, error } = useLoad(async () => (await services())[serviceId] || null, [serviceId]);
  const wrong = data !== undefined && (!data || data.mode !== "quote");
  useEffect(() => { if (wrong) router.replace("/actions"); }, [wrong, router]);
  if (error) return <LoadError />;
  if (!data || !list) return <Loading />;
  const s = data;

  const send = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const need = Object.fromEntries(s.need_fields.map((x) => [x.id, String(f.get(x.id) || "").trim()]).filter(([, v]) => v));
    setBusy(true);
    const { data: r, error } = await sb.from("requests").insert({ company_id: current.id, owner_id: uid, service_id: s.id, need, is_demo: isPreview }).select("id").single();
    if (error) { setBusy(false); return toast("تعذّر إرسال الطلب، حاول مرة أخرى", true); }
    toast("أرسلنا طلبك إلى مقدمي الخدمة");
    router.push("/requests/" + r.id);
  };

  return (
    <>
      <Head back={["/actions", "خدمة جديدة"]} eyebrow={current?.name || "خدمة بعروض أسعار"} title={s.title}>
        {s.summary && <p>{s.summary}</p>}
      </Head>
      <div className="split">
        <div className="split-main">
          {!current ? (
            <section className="panel"><p>أضف شركتك أولًا، ثم اطلب عروضًا لها.</p>
              <div className="row"><Link className="btn primary" href="/companies/new">إضافة شركة</Link><Link className="btn" href="/guide">لدي فكرة مشروع</Link></div></section>
          ) : (
            <form className="panel" onSubmit={send}>
              <h2>صف ما تحتاجه</h2>
              <p className="note">إجاباتك هي ما يبني عليه مقدمو الخدمة عروضهم. لا يظهر لهم اسم شركتك إلا بعد أن تقبل عرضًا.</p>
              {s.need_fields.map((x) => <NeedInput key={x.id} f={x} />)}
              <button className="btn primary" type="submit" disabled={busy}>اطلب العروض</button>
            </form>
          )}
        </div>
        <aside className="split-side">
          <section className="panel"><h2>كيف تتم الخدمة</h2>
            <ol className="how-steps">
              <li><b>تصف احتياجك</b><small className="note">أسئلة قليلة، ولا تدفع شيئًا الآن.</small></li>
              <li><b>تصلك العروض</b><small className="note">كل عرض بسعره ومدته وشروطه، في صفحة الطلب.</small></li>
              <li><b>تختار وتتابع</b><small className="note">العرض الذي تقبله يصبح الاتفاق، وتتابع تنفيذه مرحلة بمرحلة.</small></li>
            </ol>
          </section>
          {s.docs?.length > 0 && <section className="panel"><div className="docs"><b>جهّز هذه المستندات</b><ul>{s.docs.map((d) => <li key={d}>{d}</li>)}</ul></div></section>}
        </aside>
      </div>
    </>
  );
}

function NeedInput({ f }: { f: NeedField }) {
  const id = "need-" + f.id;
  return (
    <div className="field"><label htmlFor={id}>{f.label}{f.required ? "" : " (اختياري)"}</label>
      {f.type === "select" ? (
        <select id={id} name={f.id} required={f.required} defaultValue=""><option value="" disabled>اختر</option>{(f.options || []).map((o) => <option key={o}>{o}</option>)}</select>
      ) : <input id={id} name={f.id} required={f.required} type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"} min={f.type === "number" ? 0 : undefined} maxLength={400} />}
    </div>
  );
}

// What the owner asked for, as providers read it.
export function NeedList({ fields, need }: { fields: NeedField[]; need: Record<string, string> | null }) {
  const rows = fields.filter((f) => need?.[f.id]);
  if (!rows.length) return <p className="empty">لم تُسجَّل تفاصيل لهذا الطلب.</p>;
  return <>{rows.map((f) => <div key={f.id} className="kv"><span>{f.label}</span><b>{f.type === "number" ? num(need[f.id]) : need[f.id]}</b></div>)}</>;
}

export type Offer = { id: string; office_id: string; fee: number; days: number; terms: string | null; valid_until: string | null; status: string; created_at: string; offices?: { name: string } | null };

// The offers on a request, for the owner to compare and accept one.
export function Offers({ offers, onAccepted }: { offers: Offer[]; onAccepted: () => void }) {
  const { toast } = useSession();
  const [busy, setBusy] = useState<string | null>(null);
  const live = offers.filter((o) => o.status === "sent");
  if (!live.length) return <p className="empty">لم يصل عرض بعد. سنرسل إليك تنبيهًا عند وصول أول عرض.</p>;
  const cheap = Math.min(...live.map((o) => o.fee)), fast = Math.min(...live.map((o) => o.days));
  const accept = async (o: Offer) => {
    if (!confirm(`هل تقبل عرض ${o.offices?.name || "مقدم الخدمة"} بقيمة ${money(o.fee)}؟ بعد القبول يصبح هذا العرض هو الاتفاق، ولا يمكن اختيار عرض آخر.`)) return;
    setBusy(o.id);
    const { error } = await sb.rpc("accept_offer", { p_offer: o.id });
    setBusy(null);
    if (error) return toast(error.message.includes("offer_not_valid") ? "انتهت صلاحية هذا العرض" : "تعذّر قبول العرض، حاول مرة أخرى", true);
    toast("تم الاتفاق، وبدأ التنفيذ"); onAccepted();
  };
  return (
    <div className="offer-list">
      {live.map((o) => {
        const tags = [live.length > 1 && o.fee === cheap && "الأقل سعرًا", live.length > 1 && o.days === fast && "الأسرع"].filter(Boolean) as string[];
        const expired = !!o.valid_until && new Date(o.valid_until) < new Date(new Date().toDateString());
        return (
          <div key={o.id} className="offer">
            <div className="row"><Avatar name={o.offices?.name} /><span className="grow"><b>{o.offices?.name || "مقدم خدمة"}</b>
              <small className="note">{o.valid_until ? (expired ? "انتهت صلاحية العرض" : `العرض صالح حتى ${fmtDate(o.valid_until)}`) : `أُرسل في ${fmtDate(o.created_at)}`}</small></span>
              {tags.map((t) => <span key={t} className="chip ok">{t}</span>)}</div>
            <div className="oc-v"><span><small>السعر</small><b>{money(o.fee)}</b></span><span><small>مدة البدء والتسليم</small><b>{days(o.days)}</b></span></div>
            {o.terms && <div className="terms"><small className="note">الشروط</small><p>{o.terms}</p></div>}
            <details className="about-provider"><summary>عن مقدم الخدمة</summary><ProviderInfo officeId={o.office_id} bare /></details>
            <button className="btn primary" type="button" disabled={expired || busy === o.id} onClick={() => accept(o)}><Icon name="stamp" size={18} />اقبل هذا العرض</button>
          </div>
        );
      })}
    </div>
  );
}

export type Agreement = { fee: number; days: number; terms: string | null; agreed_at: string; expires_on: string | null };
export function AgreementBox({ a, office }: { a: Agreement; office?: string | null }) {
  return (
    <section className="panel agreement">
      <div className="row between"><h2>الاتفاق</h2><span className="chip stamp ok">متفق عليه</span></div>
      <div className="kv"><span>مقدم الخدمة</span><b>{office || ""}</b></div>
      <div className="kv"><span>السعر</span><b>{money(a.fee)}</b></div>
      <div className="kv"><span>المدة</span><b>{days(a.days)}</b></div>
      <div className="kv"><span>تاريخ الاتفاق</span><b>{fmtDate(a.agreed_at)}</b></div>
      {a.expires_on && <div className="kv"><span>يسري حتى</span><b>{fmtDate(a.expires_on)}</b></div>}
      {a.terms && <div className="terms"><small className="note">الشروط المتفق عليها</small><p>{a.terms}</p></div>}
      <small className="note">هذه نسخة ثابتة مما قُبل وقت الاتفاق، ولا يستطيع أي طرف تعديلها.</small>
    </section>
  );
}
