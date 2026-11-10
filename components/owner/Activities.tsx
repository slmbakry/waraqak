"use client";
import { ReportButton } from "../Trust";
// Activities that need a licence of their own: the list, and one activity with
// why it needs a licence, the steps and documents, and what the current
// company has done about it.
import Link from "next/link";
import { useState } from "react";
import { sb } from "@/lib/supabase";
import { days, money, num } from "@/lib/format";
import { optionsFor, services } from "@/lib/data";
import { ACTIVITIES, TIMING, activityById, grouped } from "@/lib/activities";
import { placeOf } from "@/lib/places";
import { useCompanies } from "../companies";
import { useLoad, useSession } from "../session";
import Requirements from "../Requirements";
import { Head, Icon, LoadError, Loading } from "../ui";

export function ActivityList() {
  const { current } = useCompanies();
  const mine = new Set(current?.activities || []);
  return (
    <>
      <Head back={["/actions", "الإجراءات"]} eyebrow="الأنشطة والتراخيص" title="أنشطة تحتاج ترخيصًا خاصًا">
        <p>هذه الأنشطة لا يكفي لمزاولتها السجل التجاري والبطاقة الضريبية، بل يلزمها ترخيص أو قيد لدى جهة مختصة. اعرف المطلوب قبل أن تبدأ.</p>
      </Head>
      {grouped(ACTIVITIES).map(([g, list]) => (
        <section key={g} className="panel"><h2>{g}</h2>
          <div className="section-grid">{list.map((a) => (
            <Link key={a.id} className="path-card" href={`/activities/${a.id}`}>
              <span className="chip">{mine.has(a.id) ? "من أنشطة شركتك" : a.authority}</span>
              <b>{a.title}</b><small className="note">{a.hint}</small>
            </Link>
          ))}</div>
        </section>
      ))}
    </>
  );
}

export function ActivityView({ id }: { id: string }) {
  const a = activityById(id);
  const { current, reload } = useCompanies();
  const { isPreview, toast } = useSession();
  const [n, setN] = useState(0);
  const { data, error } = useLoad(async () => {
    if (!a) return null;
    const s = (await services())[a.serviceId];
    if (!s) return null;
    const opts = await optionsFor(s.id, isPreview);
    let status: string | null = null, req: { id: string } | null = null;
    if (current) {
      const [{ data: st }, { data: r }] = await Promise.all([
        sb.from("activity_status").select("status").eq("company_id", current.id).eq("activity_id", a.id).maybeSingle(),
        sb.from("requests").select("id,status").eq("company_id", current.id).eq("service_id", s.id).not("status", "in", "(cancelled)").order("created_at", { ascending: false }).limit(1).maybeSingle(),
      ]);
      status = st?.status || null; req = r || null;
    }
    return { s, cheapest: Math.min(...opts.map((o) => o.cost)), offices: opts.length - 1, status, req };
  }, [id, current?.id, isPreview, n]);

  if (!a) return <section className="panel"><p>هذا النشاط غير موجود.</p><Link className="btn" href="/activities">كل الأنشطة</Link></section>;
  const mine = !!current?.activities?.includes(a.id);

  const setStatus = async (status: "have" | "na" | null) => {
    if (!current) return;
    const { error: e } = status
      ? await sb.from("activity_status").upsert({ company_id: current.id, activity_id: a.id, status })
      : await sb.from("activity_status").delete().eq("company_id", current.id).eq("activity_id", a.id);
    if (e) return toast("تعذّر الحفظ، حاول مرة أخرى", true);
    toast(status === "have" ? "سجّلنا أن لدى الشركة هذا الترخيص" : status === "na" ? "لن ننبهك إلى هذا الترخيص مرة أخرى" : "سننبهك إلى هذا الترخيص من جديد");
    setN((x) => x + 1);
  };
  const addActivity = async () => {
    if (!current) return;
    const { error: e } = await sb.from("companies").update({ activities: [...(current.activities || []), a.id] }).eq("id", current.id);
    if (e) return toast("تعذّر الحفظ، حاول مرة أخرى", true);
    toast("أضفنا النشاط إلى أنشطة شركتك"); reload();
  };

  return (
    <>
      <Head back={["/activities", "الأنشطة والتراخيص"]} eyebrow="نشاط يحتاج ترخيصًا" title={a.title}><p>{a.why}</p></Head>
      <div className="split">
        <div className="split-main">
          <section className="panel">
            <span className="tile-ic"><Icon name="building" /></span>
            <h2>الترخيص المطلوب</h2>
            <div className="kv"><span>الجهة المختصة</span><b>{a.authority}</b></div>
            <div className="kv"><span>متى تبدأ فيه</span><b>{TIMING[a.timing]}</b></div>
            {a.form && <div className="kv"><span>الشكل القانوني المطلوب</span><b>{a.form}</b></div>}
          </section>
          {a.notes.length > 0 && (
            <section className="panel"><h2>ما يجب معرفته</h2>
              <ul className="checklist">{a.notes.map((x) => <li key={x}><Icon name="check" size={16} />{x}</li>)}</ul>
            </section>
          )}
          {error ? <LoadError /> : data === undefined ? <Loading /> : data === null ? null : (
            <section className="panel"><h2>الخطوات</h2>
              <div className="track">{((data.s as any).stages || []).map((st: { title: string; days: number }, i: number) => (
                <div key={i} className="tr"><span className="dot" aria-hidden="true" /><div><p>{st.title}</p><small className="note">المدة المتوقعة {days(st.days)}</small></div></div>
              ))}</div>
              <Requirements serviceId={data.s.id} kind={data.s.place_kind} place={placeOf(current, data.s.place_kind)} />
            </section>
          )}
          {a.unsure.length > 0 && (
            <section className="panel unsure"><h2>ما لم نتحقق منه بعد</h2>
              <ul>{a.unsure.map((u) => <li key={u}>{u}</li>)}</ul>
              <small className="note">نراجع هذه النقاط مع مقدمي الخدمة، وتتحدث الصفحة عند تأكيدها.</small>
            </section>
          )}
          <section className="panel"><h2>المصادر</h2>
            <ul className="sources">{a.sources.map((s) => <li key={s.url}><a href={s.url} target="_blank" rel="noopener noreferrer">{s.title}</a></li>)}</ul>
          </section>
          <ReportButton kind="activity" refId={a.id} label={a.title} />
        </div>
        <aside className="split-side">
          <section className="panel sum">
            <h2>التنفيذ</h2>
            {data && <>
              <div className="kv"><span>المدة إذا نفذته بنفسك</span><b>{days(data.s.self_days)}</b></div>
              <div className="kv"><span>مقدمو خدمة متاحون</span><b>{data.offices ? num(data.offices) : "لا يوجد بعد"}</b></div>
              {data.cheapest > 0 && <div className="kv"><span>يبدأ من</span><b>{money(data.cheapest)}</b></div>}
            </>}
            {!current ? <>
              <p className="note">لتنفيذ الترخيص ومتابعته، أضف شركتك أولًا، أو ابدأ دليل التأسيس إذا لم تكن لديك شركة.</p>
              <Link className="btn primary" href="/companies/new">إضافة شركتي</Link>
              <Link className="btn" href="/guide">ابدأ دليل التأسيس</Link>
            </> : !data ? null : data.req ? <>
              <p className="note">لدى {current.name} طلب لهذا الترخيص.</p>
              <Link className="btn primary" href={`/requests/${data.req.id}`}>متابعة الطلب</Link>
            </> : data.status === "have" ? <>
              <p className="note">سجّلت أن لدى {current.name} هذا الترخيص.</p>
              <button className="linkish" type="button" onClick={() => setStatus(null)}>تراجع</button>
            </> : data.status === "na" ? <>
              <p className="note">سجّلت أن هذا الترخيص لا ينطبق على {current.name}.</p>
              <button className="linkish" type="button" onClick={() => setStatus(null)}>تراجع</button>
            </> : <>
              {!mine && <p className="note">هذا النشاط ليس ضمن أنشطة {current.name} المسجلة لدينا.</p>}
              <Link className="btn primary" href={`/start/${a.serviceId}`}>ابدأ استخراج الترخيص</Link>
              {mine ? <>
                <button className="btn" type="button" onClick={() => setStatus("have")}>لدى الشركة هذا الترخيص</button>
                <button className="linkish" type="button" onClick={() => setStatus("na")}>لا ينطبق على شركتنا</button>
              </> : <button className="btn" type="button" onClick={addActivity}>أضفه إلى أنشطة شركتي</button>}
            </>}
          </section>
        </aside>
      </div>
    </>
  );
}
