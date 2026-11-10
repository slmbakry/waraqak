"use client";
import { ReportButton } from "../Trust";
// One path of the guide: a few questions, then the procedure with who decides,
// why, its steps and documents, what is still unconfirmed, and the sources.
// It works without a company; a company is asked for only to start it.
import Link from "next/link";
import { useEffect, useState } from "react";
import { days, money, num } from "@/lib/format";
import { optionsFor, services } from "@/lib/data";
import { MEETINGS, PATHS, entityOfForm, type Answers } from "@/lib/paths";
import { placeOf } from "@/lib/places";
import { ACTIVITIES } from "@/lib/activities";
import ActivityPicker from "../ActivityPicker";
import { useCompanies } from "../companies";
import { useLoad, useSession } from "../session";
import Requirements from "../Requirements";
import { Head, Icon, LoadError, Loading } from "../ui";

export default function PathView({ id }: { id: string }) {
  const path = PATHS.find((p) => p.id === id);
  const { current } = useCompanies();
  const { isPreview } = useSession();
  const [answers, setAnswers] = useState<Answers>({});
  const [step, setStep] = useState(0);

  // A company's own legal form answers the first question.
  useEffect(() => {
    const e = entityOfForm(current?.legal_form);
    if (e) setAnswers((a) => (a.entity ? a : { ...a, entity: e }));
  }, [current?.legal_form]);

  const visible = path ? path.questions.filter((q) => !q.when || q.when(answers)) : [];
  const done = visible.every((q) => answers[q.id]);
  const outcome = path && done ? path.outcome(answers) : null;
  const { data, error } = useLoad(async () => {
    if (!outcome?.serviceId) return null;
    const svcs = await services();
    const s = svcs[outcome.serviceId];
    if (!s) return null;
    const opts = await optionsFor(s.id, isPreview);
    return { s, cheapest: Math.min(...opts.map((o) => o.cost)), offices: opts.length - 1 };
  }, [outcome?.serviceId, isPreview]);

  if (!path) return <section className="panel"><p>هذا المسار غير موجود.</p><Link className="btn" href="/actions">العودة إلى الإجراءات</Link></section>;

  if (!done) {
    const q = visible.find((x) => !answers[x.id]) || visible[visible.length - 1];
    const idx = visible.indexOf(q);
    const option = (v: string, label: string, hint?: string) => (
      <label key={v} className="opt">
        <input type="radio" name={q.id} checked={answers[q.id] === v}
          onChange={() => { setAnswers({ ...answers, [q.id]: v }); setStep(step + 1); }} />
        <span><b>{label}</b>{hint && <small>{hint}</small>}</span>
      </label>
    );
    return (
      <>
        <Head back={["/actions", "الإجراءات"]} eyebrow={path.group} title={path.title}><p>{path.sub}</p></Head>
        <section className="panel quiz">
          <div className="row between"><span className="eyebrow">سؤال {num(idx + 1)} من {num(visible.length)}</span></div>
          <h2 id="pq">{q.q}</h2>
          {q.picker === "activity" ? (() => {
            const ids = new Set(ACTIVITIES.map((a) => a.id));
            return (
              <div className="act-pick" role="radiogroup" aria-labelledby="pq">
                <ActivityPicker value={answers[q.id] ? [answers[q.id]] : null} onPick={(v) => { setAnswers({ ...answers, [q.id]: v }); setStep(step + 1); }} />
                <div className="opts">{q.options.filter(([v]) => !ids.has(v)).map(([v, label, hint]) => option(v, label, hint))}</div>
              </div>
            );
          })() : (
            <div className="opts" role="radiogroup" aria-labelledby="pq">
              {q.options.map(([v, label, hint]) => option(v, label, hint))}
            </div>
          )}
          {idx > 0 && <button className="btn" type="button" onClick={() => { const prev = visible[idx - 1]; const next = { ...answers }; delete next[prev.id]; setAnswers(next); }}>رجوع</button>}
        </section>
      </>
    );
  }

  const o = outcome;
  return (
    <>
      <Head back={["/actions", "الإجراءات"]} eyebrow={path.title} title={o.title}><p>{o.why}</p></Head>
      <div className="split">
        <div className="split-main">
          {o.decider && (
            <section className="panel">
              <span className="tile-ic"><Icon name="users" /></span>
              <h2>من يقرر؟</h2>
              <div className="kv"><span>صاحب القرار</span><b>{o.decider.who}</b></div>
              <div className="kv"><span>القرار المطلوب</span><b>{o.decider.rule}</b></div>
              {MEETINGS[o.decider.meeting] && <p className="note">{MEETINGS[o.decider.meeting]}</p>}
            </section>
          )}
          {o.notes.length > 0 && (
            <section className="panel"><h2>ما يجب معرفته</h2>
              <ul className="checklist">{o.notes.map((n) => <li key={n}><Icon name="check" size={16} />{n}</li>)}</ul>
            </section>
          )}
          {o.serviceId && (error ? <LoadError /> : data === undefined ? <Loading /> : data === null ? null : (
            <section className="panel"><h2>الخطوات</h2>
              <div className="track">{(data.s as any).stages?.map((st, i) => (
                <div key={i} className="tr"><span className="dot" aria-hidden="true" /><div><p>{st.title}</p><small className="note">المدة المتوقعة {days(st.days)}</small></div></div>
              ))}</div>
              <Requirements serviceId={data.s.id} kind={data.s.place_kind} place={placeOf(current, data.s.place_kind)} />
            </section>
          ))}
          {o.unsure.length > 0 && (
            <section className="panel unsure"><h2>ما لم نتحقق منه بعد</h2>
              <ul>{o.unsure.map((u) => <li key={u}>{u}</li>)}</ul>
              <small className="note">نراجع هذه النقاط مع مقدمي الخدمة، وتتحدث الصفحة عند تأكيدها.</small>
            </section>
          )}
          {o.sources.length > 0 && (
            <section className="panel"><h2>المصادر</h2>
              <ul className="sources">{o.sources.map((s) => <li key={s.url}><a href={s.url} target="_blank" rel="noopener noreferrer">{s.title}</a></li>)}</ul>
            </section>
          )}
          <ReportButton kind="path" refId={path.id} label={`${path.title}: ${o.title}`} />
        </div>
        <aside className="split-side">
          <section className="panel sum">
            <h2>التنفيذ</h2>
            {data && <>
              <div className="kv"><span>المدة إذا نفذته بنفسك</span><b>{days(data.s.self_days)}</b></div>
              <div className="kv"><span>مقدمو خدمة متاحون</span><b>{data.offices ? num(data.offices) : "لا يوجد بعد"}</b></div>
              {data.cheapest > 0 && <div className="kv"><span>يبدأ من</span><b>{money(data.cheapest)}</b></div>}
            </>}
            {o.link && <Link className="btn" href={o.link.href}>{o.link.label}</Link>}
            {o.serviceId && (current
              ? <Link className="btn primary" href={`/start/${o.serviceId}`}>ابدأ التنفيذ لشركة {current.name}</Link>
              : <>
                  <p className="note">لتنفيذ الإجراء ومتابعته، أضف شركتك أولًا.</p>
                  <Link className="btn primary" href="/companies/new">إضافة شركتي</Link>
                </>)}
            <button className="linkish" type="button" onClick={() => { setAnswers({}); setStep(0); }}>ابدأ الأسئلة من جديد</button>
          </section>
        </aside>
      </div>
    </>
  );
}
