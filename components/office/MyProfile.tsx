"use client";
// What owners read about this provider. The provider writes its introduction, coverage and
// phone; its name, licence number and verification are set by the platform.
import { useState } from "react";
import { sb } from "@/lib/supabase";
import { GOVERNORATES } from "@/lib/places";
import { fmtDate, num } from "@/lib/format";
import { useLoad, useSession } from "../session";
import { Head, Icon, LoadError, Loading } from "../ui";
import { PROVIDER_KINDS, ProviderInfo } from "../Provider";

export default function MyProfile() {
  const { officeId, toast, profile } = useSession();
  const [n, setN] = useState(0);
  const [areas, setAreas] = useState<string[] | null>(null);
  const { data, error } = useLoad(async () => {
    if (!officeId) return null;
    const [{ data: o }, { data: c }, { data: reviews }, { data: perf }] = await Promise.all([
      sb.from("offices").select("id,name,kind,license_no,about,areas,verified").eq("id", officeId).maybeSingle(),
      sb.from("office_contacts").select("phone").eq("office_id", officeId).maybeSingle(),
      sb.from("ratings").select("professionalism,speed,comment,created_at").eq("office_id", officeId).order("created_at", { ascending: false }).limit(8),
      sb.rpc("office_stats"),
    ]);
    return { o, phone: c?.phone || "", reviews: reviews || [], perf: (perf || []).find((x: { office_id: string }) => x.office_id === officeId) };
  }, [officeId, n]);
  if (!officeId) return <section className="panel"><p>{profile.role === "admin" ? "اختر مقدم الخدمة الذي تريد التجربة به من الشريط في الأعلى." : "حسابك غير مرتبط بمقدم خدمة بعد. تواصل مع مدير المنصة."}</p></section>;
  if (error) return <LoadError />;
  if (!data) return <Loading />;
  const { o, phone, reviews, perf } = data;
  if (!o) return <LoadError />;
  const picked = areas ?? o.areas ?? [];
  const flip = (g: string) => setAreas(picked.includes(g) ? picked.filter((x) => x !== g) : [...picked, g]);
  const save = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const a = await sb.from("offices").update({ about: String(f.get("about") || "").trim() || null, areas: picked }).eq("id", officeId);
    const b = await sb.from("office_contacts").upsert({ office_id: officeId, phone: String(f.get("phone") || "").trim() || null });
    if (a.error || b.error) return toast("تعذّر حفظ الملف", true);
    toast("تم حفظ ملفك"); setAreas(null); setN((x) => x + 1);
  };
  return (
    <>
      <Head eyebrow={o.name} title="ملفي أمام أصحاب الأعمال">
        <p>هذا ما يقرؤه صاحب العمل عنك وهو يختار أو يقارن العروض. اكتب ما يميزك بصدق واختصار.</p>
      </Head>
      <div className="split">
        <form className="panel split-main" onSubmit={save}>
          <h2>بياناتك</h2>
          <div className="kv"><span>الاسم</span><b>{o.name}</b></div>
          <div className="kv"><span>النوع</span><b>{PROVIDER_KINDS[o.kind] || o.kind || ""}</b></div>
          <div className="kv"><span>رقم الترخيص أو القيد</span><b className="ltr">{o.license_no || "غير مسجل"}</b></div>
          <div className="kv"><span>التوثيق</span>{o.verified ? <span className="chip ok"><Icon name="shield" size={14} />موثّق</span> : <span className="chip warn">بانتظار التوثيق</span>}</div>
          <small className="note">الاسم ورقم الترخيص والتوثيق تحددها المنصة. لتعديلها راسل الإدارة من زر الملاحظات.</small>
          <div className="field"><label htmlFor="pf-about">نبذة عنك: خبرتك، وما تتخصص فيه</label>
            <textarea id="pf-about" name="about" rows={4} maxLength={600} defaultValue={o.about || ""} /></div>
          <div className="field"><label htmlFor="pf-phone">رقم الهاتف</label><input id="pf-phone" name="phone" className="ltr" inputMode="tel" maxLength={30} defaultValue={phone} />
            <small className="note">لا يراه صاحب العمل إلا بعد أن تتفقا على طلب، وإذا طلبه. قبل ذلك يكون التواصل من الرسائل.</small></div>
          <div className="field"><span className="lbl">المحافظات التي تعمل فيها</span>
            <div className="chips pick">{GOVERNORATES.map((g) => <button key={g} type="button" className={"chip" + (picked.includes(g) ? " ok" : "")} aria-pressed={picked.includes(g)} onClick={() => flip(g)}>{g}</button>)}</div>
            <small className="note">{picked.length ? "اضغط على المحافظة لإضافتها أو إزالتها." : "لم تختر شيئًا، فتظهر كأنك تعمل في كل المحافظات."}</small></div>
          <button className="btn primary" type="submit">حفظ</button>
        </form>
        <aside className="split-side">
          <section className="panel"><h2>كما يراك صاحب العمل</h2><ProviderInfo key={n} officeId={officeId} /></section>
          <section className="panel"><h2>أداؤك</h2>
            <div className="kv"><span>ردودك على الطلبات</span><b>{perf?.answered ? `${num(perf.accepted)} قبول من ${num(perf.answered)}` : "لا توجد بعد"}</b></div>
            <div className="kv"><span>متوسط زمن ردك</span><b>{perf?.reply_hours != null ? `${num(perf.reply_hours)} ساعة` : "لا يوجد بعد"}</b></div>
            <small className="note">نسبة الالتزام بالموعد تُحسب من تاريخ قبولك الطلب إلى اكتماله، مقارنة بالمدة التي أعلنتها.</small>
          </section>
          <section className="panel"><h2>آخر التقييمات</h2>
            {reviews.length ? reviews.map((x, i) => (
              <div key={i} className="feed"><span className="dot" aria-hidden="true" /><span><b>احترافية {num(x.professionalism)} · سرعة {num(x.speed)}</b><small>{x.comment ? x.comment + " · " : ""}{fmtDate(x.created_at)}</small></span></div>
            )) : <p className="empty">لا توجد تقييمات بعد.</p>}
          </section>
        </aside>
      </div>
    </>
  );
}
