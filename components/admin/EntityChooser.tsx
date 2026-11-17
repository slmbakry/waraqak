"use client";
// Choosing a legal form, drawn as a map that dims what the answers rule out.
// Admin-only while its content (lib/entities.ts) waits for the lawyer's review.
import { useState } from "react";
import { num } from "@/lib/format";
import { ENTITIES, FAMILIES, NOT_COVERED, QUESTIONS, ruledOut, type Answers } from "@/lib/entities";
import { Head } from "../ui";

export default function EntityChooser() {
  const [a, setA] = useState<Answers>({});
  const [open, setOpen] = useState<string | null>(null);
  const out = ruledOut(a);
  const left = ENTITIES.filter((e) => !out[e.id]);
  const chosen = open ? ENTITIES.find((e) => e.id === open) : null;
  const answered = QUESTIONS.some((q) => a[q.id]);

  return (
    <>
      <Head eyebrow="الدليل" title="أي شكل قانوني يناسب مشروعك؟">
        <p>أجب عن الأسئلة، وتبهت الأشكال التي لا تتفق مع إجاباتك، ويبقى المتاح لك.</p>
      </Head>
      <p className="ent-draft">مسودة للمراجعة القانونية، تظهر للمدير فقط. القواعد هنا لم يراجعها محامٍ بعد.</p>

      <section className="panel stack">
        {QUESTIONS.map((q) => (
          <div key={q.id} className="ent-q">
            <b>{q.q}</b><small className="note">{q.help}</small>
            <div className="ent-chips" role="radiogroup" aria-label={q.q}>
              {q.options.map((o) => (
                <button key={o.id} type="button" role="radio" aria-checked={a[q.id] === o.id}
                  className={"ent-chip" + (a[q.id] === o.id ? " on" : "")}
                  onClick={() => setA({ ...a, [q.id]: a[q.id] === o.id ? undefined : o.id })}>{o.label}</button>
              ))}
            </div>
          </div>
        ))}
      </section>

      <section className="panel stack">
        <div className="row between">
          <b>المتاح حسب إجاباتك: {num(left.length)} من {num(ENTITIES.length)}</b>
          {answered && <button className="linkish" type="button" onClick={() => { setA({}); setOpen(null); }}>ابدأ من الأول</button>}
        </div>
        {left.length === 0 && <p className="ent-why">إجاباتك لا يجتمع عليها أي شكل. غيّر إجابة لتظهر الأشكال المتاحة.</p>}
        <div className="ent-map">
          {FAMILIES.map(([fam, title]) => (
            <div key={fam} className="ent-col">
              <small className="note">{title}</small>
              {ENTITIES.filter((e) => e.family === fam).map((e) => (
                <button key={e.id} type="button" className={"ent-card" + (out[e.id] ? " off" : "") + (open === e.id ? " sel" : "")}
                  aria-pressed={open === e.id} onClick={() => setOpen(open === e.id ? null : e.id)}>{e.name}</button>
              ))}
            </div>
          ))}
        </div>
        {chosen && (out[chosen.id]
          ? <p className="ent-why"><b>{chosen.name}</b> خرج بسبب إجابتك عن سؤال «{out[chosen.id]!.question}»: {out[chosen.id]!.reason}</p>
          : <div className="ent-why"><b>{chosen.name}</b>
              <div className="kv"><span>الملاك</span><small>{chosen.founders}</small></div>
              <div className="kv"><span>المسؤولية</span><small>{chosen.liability}</small></div>
              <div className="kv"><span>الملكية</span><small>{chosen.ownership}</small></div>
              <p className="note">{chosen.note}</p></div>)}
        {!chosen && <p className="note">اضغط على أي شكل لتعرف عنه، أو لتعرف لماذا خرج من الحسبة.</p>}
      </section>

      {left.length > 0 && left.length <= 3 && answered && (
        <section className="panel stack">
          <h2>الفرق بين المتاح لك</h2>
          <div className="ent-table" role="table">
            <div className="ent-tr head" role="row"><span role="columnheader" />{left.map((e) => <b key={e.id} role="columnheader">{e.name}</b>)}</div>
            {([["الملاك", "founders"], ["المسؤولية", "liability"], ["الملكية", "ownership"]] as const).map(([label, k]) => (
              <div key={k} className="ent-tr" role="row"><span role="rowheader">{label}</span>{left.map((e) => <small key={e.id} role="cell">{e[k]}</small>)}</div>
            ))}
          </div>
          <p className="note">هذه مقارنة للمعلومات، وليست ترشيحًا لشكل بعينه. استشر متخصصًا قبل القرار النهائي.</p>
        </section>
      )}

      <section className="panel stack">
        <h2>ما لم تدخله هذه الأسئلة بعد</h2>
        <ul className="ent-list">{NOT_COVERED.map((x) => <li key={x}>{x}</li>)}</ul>
        <p className="note">المعلومات إرشادية ولا تغني عن استشارة قانونية.</p>
      </section>
    </>
  );
}
