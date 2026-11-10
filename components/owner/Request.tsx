"use client";
// One request, as its owner (or an admin) sees it: status, stages, files, history and the rating.
import { sb } from "@/lib/supabase";
import { DAY, days, fmtDate, money, num } from "@/lib/format";
import { eventLabel, eventNote, STATUS, awaitingOffers, services, stageLate } from "@/lib/data";
import { useLoad, useSession } from "../session";
import { FilesBlock, Head, Kpi, LoadError, Loading, StageRow, finishStage } from "../ui";
import Requirements from "../Requirements";
import OwnerConfirm from "./OwnerConfirm";
import Thread from "../Thread";
import { ProviderContact, ProviderInfo } from "../Provider";
import { DisputeBox, type DisputeRow } from "../Dispute";
import { placeOf } from "@/lib/places";
import { AgreementBox, NeedList, Offers, type Agreement, type Offer } from "./Quote";

export default function Request({ id }: { id: string }) {
  const { uid, toast, role } = useSession();
  const { data, error, reload } = useLoad(async () => {
    const svcs = await services();
    const [{ data: r }, { data: stages }, { data: events }, { data: offers }, { data: agreement }] = await Promise.all([
      sb.from("requests").select("*, offices(name), companies(name,governorate,registry_office,tax_office)").eq("id", id).maybeSingle(),
      sb.from("request_stages").select("*").eq("request_id", id).order("idx"),
      sb.from("events").select("*").eq("request_id", id).order("created_at"),
      sb.from("offers").select("*, offices(name)").eq("request_id", id).eq("auto", false).order("fee"),
      sb.from("agreements").select("*").eq("request_id", id).maybeSingle(),
    ]);
    const { data: disputes } = await sb.from("disputes").select("*").eq("request_id", id).order("created_at");
    if (!r) return { r: null };
    const canRate = r.status === "done" && !!r.office_id;
    const { data: rating } = canRate ? await sb.from("ratings").select("*").eq("request_id", id).maybeSingle() : { data: null };
    return { r, s: svcs[r.service_id], stages: stages || [], events: events || [], canRate, rating, offers: (offers || []) as Offer[], agreement: agreement as Agreement | null, disputes: (disputes || []) as DisputeRow[] };
  }, [id]);
  if (error) return <LoadError />;
  if (!data) return <Loading />;
  const { r, s, stages, events, canRate, rating, offers, agreement, disputes } = data;
  if (!r) return <section className="panel"><p>هذا الطلب غير موجود.</p></section>;

  const waiting = awaitingOffers(r);          // a request for offers nobody has been chosen for yet
  const self = !r.office_id && !waiting;
  const liveOffers = offers.filter((o) => o.status === "sent").length;
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
        <p>{waiting ? "أرسلنا طلبك إلى مقدمي الخدمة في هذا القسم. تظهر عروضهم هنا لتقارن وتختار." : self ? "تنفذ هذا الطلب بنفسك، ويمكنك تحديد كل مرحلة عند اكتمالها." : `ينفذه ${r.offices?.name || ""}. ومقدم الخدمة هو من يحدّث المراحل.`}</p>
      </Head>
      {waiting && open ? (
        <div className="kpis">
          <Kpi ic="stamp" tone="warn" value="بانتظار العروض" label="الحالة" />
          <Kpi ic="list" tone={liveOffers ? "ok" : ""} value={liveOffers} label="عروض وصلت" />
          <Kpi ic="calendar" value={fmtDate(r.created_at)} label="تاريخ الطلب" />
        </div>
      ) : (
        <div className="kpis">
          <Kpi ic={r.status === "done" ? "check" : "stamp"} tone={tone} value={label} label="الحالة" />
          <Kpi ic="list" tone={lateNow ? "bad" : ""} value={`${num(doneCount)} من ${num(stages.length)}`} label={lateNow ? `المرحلة متأخرة ${days(lateNow)}` : "مراحل مكتملة"} />
          <Kpi ic="chart" tone="ok" value={money(r.quoted_fee)} label={r.mode === "quote" ? "السعر المتفق عليه" : "التكلفة المعلنة"} />
          <Kpi ic="clock" tone="warn" value={r.status === "done" ? fmtDate(r.completed_at) : fmtDate(due)} label={r.status === "done" ? "اكتمل في" : "الموعد المتوقع"} />
        </div>
      )}
      {!self && !waiting && r.status === "new" && <p className="alert">الطلب بانتظار قبول مقدم الخدمة.</p>}
      {disputes.some((d) => d.status === "open") ? <p className="alert">شكواك عند الإدارة الآن، وسيصلك ردها هنا وفي التنبيهات.</p>
        : r.escalated_at && open && <p className="alert">تم إبلاغ الإدارة بهذا التأخير، وهي تتابعه مع مقدم الخدمة.</p>}
      <div className="split">
        <div className="split-main">
          {r.status === "done" && role === "owner" && <OwnerConfirm companyId={r.company_id} service={s} />}
          {canRate && <RateBlock rating={rating} office={r.offices?.name} requestId={id} officeId={r.office_id} onDone={reload} />}
          {waiting && open && (
            <section className="panel"><div className="row between"><h2>العروض</h2><span className="note">قارن السعر والمدة والشروط</span></div>
              <Offers offers={offers} onAccepted={reload} />
              <button className="btn danger small" type="button" onClick={cancel}>إلغاء الطلب</button>
            </section>
          )}
          {agreement && r.mode === "quote" && <AgreementBox a={agreement} office={r.offices?.name} />}
          {!(waiting && open) && <section className="panel"><h2>المراحل</h2>
            <div className="track">
              {stages.map((x, i) => <StageRow key={x.id} stage={x} isNow={i === cur && open} onFinish={self && i === cur && open ? () => finish(x) : undefined} />)}
            </div>
            {r.status === "new" && <button className="btn danger small" type="button" onClick={cancel}>إلغاء الطلب</button>}
          </section>}
          {!self && !waiting && <Thread requestId={id} events={events} other={r.offices?.name || "مقدم الخدمة"} asOffice={false} closed={r.status === "cancelled"} onChange={reload} />}
        </div>
        <aside className="split-side">
          {r.mode === "quote" && <section className="panel"><h2>ما طلبته</h2><NeedList fields={s.need_fields || []} need={r.need} /></section>}
          {!self && !waiting && (
            <section className="panel">
              <ProviderInfo officeId={r.office_id} />
              <ProviderContact officeId={r.office_id} agreed={["accepted", "in_progress", "done"].includes(r.status)} />
            </section>
          )}
          {r.status !== "done" && <section className="panel"><Requirements serviceId={s.id} kind={s.place_kind} place={placeOf(r.companies, s.place_kind)} /></section>}
          <section className="panel"><FilesBlock requestId={id} /></section>
          <DisputeBox requestId={id} list={disputes} canOpen={role === "owner" && !!r.office_id && ["accepted", "in_progress", "done"].includes(r.status)} onChange={reload} />
          <section className="panel"><h2>سجل النشاط</h2>
            {events.filter((e) => !["note", "doc_request"].includes(e.kind)).reverse().map((e) => (
              <div key={e.id} className="feed">
                <span className={`dot ${["declined", "cancelled"].includes(e.kind) ? "bad" : e.kind === "note" || e.kind === "file" ? "warn" : ""}`} aria-hidden="true" />
                <span><b>{eventLabel(e.kind, r.mode)}</b><small>{e.note ? eventNote(e) + " · " : ""}{fmtDate(e.created_at)}</small></span>
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

