"use client";
// A provider as owners see it: who it is, where it works and how it has performed.
// Contact details are a separate, later step: they exist for the owner only after an agreement.
import { useState } from "react";
import { sb } from "@/lib/supabase";
import { num } from "@/lib/format";
import { useLoad } from "./session";
import { Avatar, Icon } from "./ui";

export const PROVIDER_KINDS: Record<string, string> = { accounting: "مكتب محاسبة", law: "مكتب محاماة", consulting: "مكتب استشارات", company: "شركة خدمات", broker: "وسيط", individual: "فرد" };

export function ProviderInfo({ officeId, bare }: { officeId: string; bare?: boolean }) {
  const { data } = useLoad(async () => {
    const [{ data: o }, { data: ratings }, { data: perf }] = await Promise.all([
      sb.from("offices").select("id,name,kind,about,areas,verified").eq("id", officeId).maybeSingle(),
      sb.from("ratings").select("professionalism,speed").eq("office_id", officeId),
      sb.rpc("office_stats"),
    ]);
    const n = ratings?.length || 0, p = (perf || []).find((x: { office_id: string }) => x.office_id === officeId);
    return { o, n, pro: n ? ratings.reduce((a, r) => a + r.professionalism, 0) / n : 0, speed: n ? ratings.reduce((a, r) => a + r.speed, 0) / n : 0, done: p?.done || 0, onTime: p?.on_time || 0 };
  }, [officeId]);
  if (!data?.o) return null;
  const { o, n, pro, speed, done, onTime } = data;
  return (
    <div className="provider">
      {!bare && <div className="row"><Avatar name={o.name} /><span className="grow"><b>{o.name}</b><small className="note">{PROVIDER_KINDS[o.kind] || "مقدم خدمة"}</small></span>
        {o.verified && <span className="chip ok"><Icon name="shield" size={14} />موثّق</span>}</div>}
      {bare && o.verified && <span className="chip ok"><Icon name="shield" size={14} />موثّق</span>}
      {o.about && <p className="about">{o.about}</p>}
      <div className="kv"><span>يعمل في</span><b>{o.areas?.length ? o.areas.join("، ") : "كل المحافظات"}</b></div>
      <div className="kv"><span>التقييم</span><b>{n ? `احترافية ${num(pro.toFixed(1))} · سرعة ${num(speed.toFixed(1))}` : "لا توجد تقييمات بعد"}</b></div>
      {n > 0 && <div className="kv"><span>عدد التقييمات</span><b>{num(n)}</b></div>}
      <div className="kv"><span>طلبات مكتملة</span><b>{num(done)}</b></div>
      {done > 0 && <div className="kv"><span>التزم بالموعد في</span><b>{num(Math.round((onTime / done) * 100))}٪</b></div>}
    </div>
  );
}

// Shown as late as possible: after the agreement, and only when the owner asks for it.
export function ProviderContact({ officeId, agreed }: { officeId: string; agreed: boolean }) {
  const [phone, setPhone] = useState<string | null | undefined>(undefined);
  if (!agreed) return <small className="note">تواصل مع مقدم الخدمة من الرسائل. يتاح رقم الهاتف بعد الاتفاق.</small>;
  const show = async () => {
    const { data } = await sb.from("office_contacts").select("phone").eq("office_id", officeId).maybeSingle();
    setPhone(data?.phone || null);
  };
  if (phone === undefined) return (
    <div className="stack"><small className="note">الأفضل أن تتواصلا من الرسائل هنا، ليبقى كل ما اتفقتما عليه مكتوبًا.</small>
      <button className="linkish" type="button" onClick={show}>أحتاج رقم الهاتف</button></div>
  );
  return phone ? <a className="btn" href={`tel:${phone}`}><span className="ltr">{phone}</span></a> : <small className="note">لم يسجل مقدم الخدمة رقم هاتف.</small>;
}
