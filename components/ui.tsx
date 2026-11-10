"use client";
// Small building blocks shared by every screen.
import Link from "next/link";
import { useState } from "react";
import { sb } from "@/lib/supabase";
import { days, fmtDate, initial, money, num } from "@/lib/format";
import { optionLabel, stageLate, type Option, type Stage } from "@/lib/data";
import { useLoad, useSession } from "./session";

// One icon per meaning, drawn on a 24 grid: a stroke outline (s) over a soft filled accent (a).
const ring = (cx: number, cy: number, r: number) => `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;
const DOC = "M7 3.5h6.5L19 9v10.5a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-15a1 1 0 0 1 1-1zM13.5 3.5V9H19";
const CLIP = "M8 5.5H6.5A1.5 1.5 0 0 0 5 7v12a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 19V7a1.5 1.5 0 0 0-1.5-1.5H16M9 4h6v3.5H9zM9 12h6M9 16h4";
const ICONS: Record<string, { s: string; a?: string }> = {
  check: { s: "M5 12.5l4.5 4.5L19 7.5" },
  plus: { s: "M12 5v14M5 12h14" },
  arrow: { s: "M4 12h12M12 6l6 6-6 6" },
  search: { s: ring(10.5, 10.5, 6) + "M15 15l5 5" },
  home: { s: "M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z", a: "M9.5 14.5h5V20h-5z" },
  calendar: { s: "M5 6.5h14a1 1 0 0 1 1 1V19a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7.5a1 1 0 0 1 1-1zM4 10.5h16M8.5 4v4M15.5 4v4M9 15l2 2 4-4", a: "M4 7.5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v3H4z" },
  compass: { s: ring(12, 12, 8.5) + "M15.2 8.8l-1.9 4.5-4.5 1.9 1.9-4.5z", a: "M15.2 8.8l-1.9 4.5-4.5 1.9 1.9-4.5z" },
  folder: { s: "M4 7.5A1.5 1.5 0 0 1 5.5 6h4l2 2.5h7A1.5 1.5 0 0 1 20 10v7.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z", a: "M4 11h16v6.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z" },
  list: { s: CLIP, a: "M9 4h6v3.5H9z" },
  doc: { s: DOC, a: "M13.5 3.5V9H19z" },
  docOk: { s: DOC + "M9.5 14.5l2 2 3.5-4", a: "M13.5 3.5V9H19z" },
  stamp: { s: "M9.5 4.5h5v3.2l-1 4.3h3a2 2 0 0 1 2 2V16h-13v-2a2 2 0 0 1 2-2h3l-1-4.3zM5.5 19.5h13", a: "M5.5 14a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v2h-13z" },
  shield: { s: "M12 3.5l7 2.5v5.5c0 4.2-2.9 7.4-7 9-4.1-1.6-7-4.8-7-9V6zM9 12l2 2 4-4", a: "M12 3.5l7 2.5v5.5c0 4.2-2.9 7.4-7 9-4.1-1.6-7-4.8-7-9V6z" },
  clock: { s: ring(12, 12, 8.5) + "M12 7.5V12l3 2", a: ring(12, 12, 8.5) },
  alert: { s: "M12 4.5 20.5 19h-17zM12 10v4.5M12 16.8v.2", a: "M12 4.5 20.5 19h-17z" },
  bell: { s: "M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15L6 16zM10 20a2 2 0 0 0 4 0", a: "M6 16V11a6 6 0 1 1 12 0v5z" },
  building: { s: "M5 20.5V6l7-2.5v17M12 9h6.5a.5.5 0 0 1 .5.5v11M3.5 20.5h17M8.5 9v.01M8.5 12.5v.01M8.5 16v.01M15.5 13v.01M15.5 16.5v.01", a: "M5 6l7-2.5v17H5z" },
  person: { s: ring(12, 8, 3.5) + "M5 20c1.2-3.6 4-5 7-5s5.8 1.4 7 5", a: ring(12, 8, 3.5) },
  users: { s: ring(9, 8, 3) + "M3 20c.9-3.2 3.2-5 6-5s5.1 1.8 6 5M16 5.5a3 3 0 0 1 0 5.5M18 15c1.6.6 2.7 2.2 3 5", a: ring(9, 8, 3) },
  star: { s: "M12 3.5l2.6 5.4 5.9.7-4.4 4 1.2 5.9L12 16.6l-5.3 2.9 1.2-5.9-4.4-4 5.9-.7z", a: "M12 3.5l2.6 5.4 5.9.7-4.4 4 1.2 5.9L12 16.6l-5.3 2.9 1.2-5.9-4.4-4 5.9-.7z" },
  chart: { s: "M5 20v-9M10.5 20V5M16 20v-6.5M21 20H3" },
  mail: { s: "M4 6.5h16a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1zM3.5 8l8.5 5.5L20.5 8", a: "M3.5 8 12 13.5 20.5 8v-.5a1 1 0 0 0-1-1h-15a1 1 0 0 0-1 1z" },
  send: { s: "M20.5 4 3.5 10.5l6.5 2.5 2.5 6.5zM10 13l4-4", a: "M20.5 4 10 13l2.5 6.5z" },
  chat: { s: "M5 5.5h14a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5h-7L8 20v-3.5H5A1.5 1.5 0 0 1 3.5 15V7A1.5 1.5 0 0 1 5 5.5zM8 10h8M8 13h5" },
  idea: { s: "M9 17.5h6M10 20.5h4M12 3.5a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2v1.1h5v-1.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3.5z", a: "M12 3.5a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2v1.1h5v-1.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3.5z" },
  book: { s: "M5 5.5A1.5 1.5 0 0 1 6.5 4H19v13H6.5A1.5 1.5 0 0 0 5 18.5zM5 18.5A1.5 1.5 0 0 0 6.5 20H19v-3M9 8h6M9 11h4" },
  logout: { s: "M10 4.5H6.5A1.5 1.5 0 0 0 5 6v12a1.5 1.5 0 0 0 1.5 1.5H10M14 8l4 4-4 4M18 12H9.5" },
  pulse: { s: "M4 12h4l3-7 4 14 3-7h2" },
};
export function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const i = ICONS[name] || ICONS.doc;
  return (
    <svg className="ic" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      {i.a && <path d={i.a} fill="currentColor" stroke="none" opacity=".18" />}
      <path d={i.s} />
    </svg>
  );
}

export const Loading = () => <div className="loading">جارٍ التحميل</div>;
export const LoadError = () => <section className="panel"><p>حدثت مشكلة أثناء تحميل الصفحة. حدّث الصفحة وحاول مرة أخرى.</p></section>;

export function Kpi({ ic, tone = "", value, label }: { ic: string; tone?: string; value: React.ReactNode; label: React.ReactNode }) {
  return (
    <div className={`kpi ${tone}`}>
      <span className={`tile-ic ${tone}`}><Icon name={ic} size={22} /></span>
      <div><b>{typeof value === "number" ? num(value) : value}</b><span>{label}</span></div>
    </div>
  );
}

// The title block at the top of each screen.
export function Head({ eyebrow, title, back, className = "", children }: { eyebrow?: React.ReactNode; title?: React.ReactNode; back?: [string, string]; className?: string; children?: React.ReactNode }) {
  return (
    <section className={`head ${className}`.trim()}>
      {back && <Link className="back" href={back[0]}>→ {back[1]}</Link>}
      {eyebrow && <span className="eyebrow">{eyebrow}</span>}
      {title && <h1>{title}</h1>}
      {children}
    </section>
  );
}

export function Avatar({ name, self }: { name?: string | null; self?: boolean }) {
  return <span className="avatar">{self ? <Icon name="person" /> : initial(name)}</span>;
}

// The doers for one service as radio cards, marked cheapest, fastest and best rated.
export function OptionCards({ opts, name, picked, onPick }: { opts: Option[]; name: string; picked: string; onPick: (key: string) => void }) {
  const cheap = Math.min(...opts.map((o) => o.cost)), fast = Math.min(...opts.map((o) => o.days));
  const rated = opts.filter((o) => o.count).sort((a, b) => b.pro + b.speed - (a.pro + a.speed))[0];
  return (
    <div className="opt-cards" role="radiogroup">
      {opts.map((o) => {
        const tags = [o.cost === cheap && "الأرخص", o.days === fast && "الأسرع", rated && o.key === rated.key && "الأعلى تقييماً"].filter(Boolean) as string[];
        return (
          <label key={o.key} className={"opt-card" + (o.key === picked ? " on" : "")}>
            <input type="radio" name={name} value={o.key} checked={o.key === picked} onChange={() => onPick(o.key)} />
            <span className="oc-top"><Avatar name={o.label} self={!o.officeId} /><span className="oc-n"><b>{o.label}</b><small>{optionLabel(o)}</small></span></span>
            {tags.length > 0 && <span className="chips">{tags.map((t) => <span key={t} className="chip ok">{t}</span>)}</span>}
            <span className="oc-v"><span><small>التكلفة</small><b>{money(o.cost)}</b></span><span><small>المدة</small><b>{days(o.days)}</b></span></span>
          </label>
        );
      })}
    </div>
  );
}

// One row of the stage track, shared by the owner and office screens.
export function StageRow({ stage, isNow, onFinish }: { stage: Stage; isNow: boolean; onFinish?: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const late = isNow ? stageLate(stage) : 0;
  const note = stage.done_at ? "اكتملت في " + fmtDate(stage.done_at) : late ? `متأخرة ${days(late)}` : "المدة المتوقعة " + days(stage.planned_days);
  return (
    <div className={`tr ${stage.done_at ? "done" : isNow ? "now" : ""}${late ? " late" : ""}`}>
      <span className="dot" aria-hidden="true" />
      <div><p>{stage.title}</p><small className="note">{note}</small></div>
      {onFinish && <button className="btn small" type="button" disabled={busy} onClick={async () => { setBusy(true); await onFinish(); setBusy(false); }}>تمت</button>}
    </div>
  );
}

// Finishing a stage is a single update: database triggers start the next
// stage, log events, close the request and extend or add the document.
export async function finishStage(stage: Stage & { id: string }) {
  const now = new Date().toISOString();
  return sb.from("request_stages").update({ done_at: now, started_at: stage.started_at || now }).eq("id", stage.id);
}

// Files attached to a request, readable by everyone who can see the request.
export function FilesBlock({ requestId }: { requestId: string }) {
  const { toast, uid } = useSession();
  const prefix = `requests/${requestId}`;
  const { data: files, reload } = useLoad(async () => {
    const { data } = await sb.storage.from("files").list(prefix, { sortBy: { column: "created_at", order: "desc" } });
    return (data || []).filter((f) => f.name !== ".emptyFolderPlaceholder");
  }, [prefix]);
  const open = async (name: string) => {
    const { data: s, error } = await sb.storage.from("files").createSignedUrl(`${prefix}/${name}`, 300);
    if (error) return toast("تعذّر فتح الملف", true);
    window.open(s.signedUrl, "_blank", "noopener");
  };
  const upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; e.target.value = ""; if (!f) return;
    if (f.size > 10 * 1024 * 1024) return toast("حجم الملف أكبر من ١٠ ميجابايت", true);
    const safe = f.name.replace(/[^\w.\-؀-ۿ]+/g, "_");
    const { error } = await sb.storage.from("files").upload(`${prefix}/${Date.now()}-${safe}`, f);
    if (error) return toast("تعذّر رفع الملف", true);
    await sb.from("events").insert({ request_id: requestId, actor_id: uid, kind: "file", note: f.name });
    toast("تم رفع الملف"); reload();
  };
  return (
    <>
      <h3 className="sub">الملفات</h3>
      {!files ? <Loading /> : files.length ? files.map((f) => (
        <div className="kv" key={f.name}><span>{f.name.replace(/^\d+-/, "")}</span><button className="btn small" type="button" onClick={() => open(f.name)}>عرض</button></div>
      )) : <p className="empty">لا توجد ملفات بعد.</p>}
      <label className="btn small" htmlFor={`up-${requestId}`}>ارفع ملف</label>
      <input type="file" id={`up-${requestId}`} hidden onChange={upload} />
    </>
  );
}
