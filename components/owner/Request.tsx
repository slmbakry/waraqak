"use client";
// One request, as its owner (or an admin) sees it: status, stages, files, history and the rating.
import { sb } from "@/lib/supabase";
import { DAY, days, fmtDate, money, num } from "@/lib/format";
import { EVENTS, STATUS, services, stageLate } from "@/lib/data";
import { useLoad, useSession } from "../session";
import { Avatar, FilesBlock, Head, Kpi, LoadError, Loading, StageRow, finishStage } from "../ui";
import Requirements from "../Requirements";
import OwnerConfirm from "./OwnerConfirm";
import { placeOf } from "@/lib/places";

export default function Request({ id }: { id: string }) {
  const { uid, toast, role } = useSession();
  const { data, error, reload } = useLoad(async () => {
    const svcs = await services();
    const [{ data: r }, { data: stages }, { data: events }] = await Promise.all([
      sb.from("requests").select("*, offices(name,phone), companies(name,governorate,registry_office,tax_office)").eq("id", id).maybeSingle(),
      sb.from("request_stages").select("*").eq("request_id", id).order("idx"),
      sb.from("events").select("*").eq("request_id", id).order("created_at"),
    ]);
    if (!r) return { r: null };
    const canRate = r.status === "done" && !!r.office_id;
    const { data: rating } = canRate ? await sb.from("ratings").select("*").eq("request_id", id).maybeSingle() : { data: null };
    return { r, s: svcs[r.service_id], stages: stages || [], events: events || [], canRate, rating };
  }, [id]);
  if (error) return <LoadError />;
  if (!data) return <Loading />;
  const { r, s, stages, events, canRate, rating } = data;
  if (!r) return <section className="panel"><p>هذا الطلب غير موجود.</p></section>;

  const self = !r.office_id;
  const cur = stages.findIndex((x) => !x.done_at);
  const open = !["done", "cancelled"].includes(r.status);
  const doneCount = stages.filter((x) => x.done_at).length;
  const due = new Date(new Date(r.accepted_at || r.created_at).getTime() + (r.quoted_days || 0) * DAY);
  const lateNow = cur >= 0 && open ? stageLate(stages[cur]) : 0;
  const [tone, label] = STATUS[r.status];

  const finish = async (st) => {
    const { error } = await finishStage(st);
    if (error) return toast("تعذّر تحديث المرحلة", true);
    reload();
  };
  const cancel = async () => {
    const { error } = await sb.from("requests").update({ status: "cancelled" }).eq("id", id);
    if (error) return toast("تعذّر إلغاء الطلب", true);
    await sb.from("events").insert({ request_id: id, actor_id: uid, kind: "cancelled" });
    toast("تم إلغاء الطلب"); reload();
  };

  return (
    <>
      <Head back={[`/companies/${r.company_id}`, "لوحتي"]} eyebrow={r.companies?.name || ""} title={s.title}>
        <p>{self ? "تنفذ هذا الطلب بنفسك، ويمكنك تحديد كل مرحلة عند اكتمالها." : `ينفذه ${r.offices?.name || ""}. ومقدم الخدمة هو من يحدّث المراحل.`}</p>
      </Head>
      <div className="kpis">
        <Kpi ic={r.status === "done" ? "check" : "stamp"} tone={tone} value={label} label="الحالة" />
        <Kpi ic="list" tone={lateNow ? "bad" : ""} value={`${num(doneCount)} من ${num(stages.length)}`} label={lateNow ? `المرحلة متأخرة ${days(lateNow)}` : "مراحل مكتملة"} />
        <Kpi ic="chart" tone="ok" value={money(r.quoted_fee)} label="التكلفة المعلنة" />
        <Kpi ic="clock" tone="warn" value={r.status === "done" ? fmtDate(r.completed_at) : fmtDate(due)} label={r.status === "done" ? "اكتمل في" : "الموعد المتوقع"} />
      </div>
      {!self && r.status === "new" && <p className="alert">الطلب بانتظار قبول مقدم الخدمة.</p>}
      {r.escalated_at && open && <p className="alert">تم إبلاغ الإدارة بهذا التأخير، وهي تتابعه مع مقدم الخدمة.</p>}
      <div className="split">
        <div className="split-main">
          {r.status === "done" && role === "owner" && <OwnerConfirm companyId={r.company_id} service={s} />}
          {canRate && <RateBlock rating={rating} office={r.offices?.name} requestId={id} officeId={r.office_id} onDone={reload} />}
          <section className="panel"><h2>المراحل</h2>
            <div className="track">
              {stages.map((x, i) => <StageRow key={x.id} stage={x} isNow={i === cur && open} onFinish={self && i === cur && open ? () => finish(x) : undefined} />)}
            </div>
            {r.status === "new" && <button className="btn danger small" type="button" onClick={cancel}>إلغاء الطلب</button>}
          </section>
        </div>
        <aside className="split-side">
          {!self && (
            <section className="panel">
              <div className="row"><Avatar name={r.offices?.name} /><span className="grow"><b>{r.offices?.name || ""}</b><small className="note">مقدم الخدمة المنفذ</small></span></div>
              {r.offices?.phone && <a className="btn" href={`tel:${r.offices.phone}`}><span className="ltr">{r.offices.phone}</span></a>}
            </section>
          )}
          {r.status !== "done" && <section className="panel"><Requirements serviceId={s.id} kind={s.place_kind} place={placeOf(r.companies, s.place_kind)} /></section>}
          <section className="panel"><FilesBlock requestId={id} /></section>
          <section className="panel"><h2>سجل النشاط</h2>
            {events.slice().reverse().map((e) => (
              <div key={e.id} className="feed">
                <span className={`dot ${["declined", "cancelled"].includes(e.kind) ? "bad" : e.kind === "note" || e.kind === "file" ? "warn" : ""}`} aria-hidden="true" />
                <span><b>{EVENTS[e.kind] || e.kind}</b><small>{e.note ? e.note + " · " : ""}{fmtDate(e.created_at)}</small></span>
              </div>
            ))}
          </section>
        </aside>
      </div>
    </>
  );
}

// After an office finishes, the owner rates it once. Speed is also measured from dates.
function RateBlock({ rating, office, requestId, officeId, onDone }) {
  const { uid, toast } = useSession();
  if (rating) return (
    <section className="panel"><h2>تقييمك لمقدم الخدمة</h2>
      <div className="kv"><span>الاحترافية</span><b>{num(rating.professionalism)} من ٥</b></div>
      <div className="kv"><span>السرعة</span><b>{num(rating.speed)} من ٥</b></div>
      {rating.comment && <p className="note">{rating.comment}</p>}
    </section>
  );
  const scale = (name: string) => (
    <div className="stars">{[1, 2, 3, 4, 5].map((n) => <label key={n}><input type="radio" name={name} value={n} /><span>{num(n)}</span></label>)}</div>
  );
  const save = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    if (!f.get("pro") || !f.get("speed")) return toast("اختر تقييمًا للاحترافية والسرعة", true);
    const { error } = await sb.from("ratings").insert({ request_id: requestId, office_id: officeId, owner_id: uid,
      professionalism: Number(f.get("pro")), speed: Number(f.get("speed")), comment: String(f.get("comment")).trim() || null });
    if (error) return toast("تعذّر حفظ التقييم", true);
    await sb.from("events").insert({ request_id: requestId, actor_id: uid, kind: "rated" });
    toast("شكرًا، تم حفظ تقييمك"); onDone();
  };
  return (
    <section className="panel"><h2>قيّم {office || "مقدم الخدمة"}</h2>
      <p className="note">يساعد تقييمك أصحاب الأعمال الآخرين على الاختيار، ويُحتسب مع نسبة التزام مقدم الخدمة بالمواعيد.</p>
      <form className="rate" onSubmit={save}>
        <div className="field"><label>الاحترافية والتعامل</label>{scale("pro")}</div>
        <div className="field"><label>السرعة</label>{scale("speed")}</div>
        <div className="field"><label htmlFor="comment">تعليق (اختياري)</label><input id="comment" name="comment" /></div>
        <button className="btn primary" type="submit">حفظ التقييم</button>
      </form>
    </section>
  );
}

