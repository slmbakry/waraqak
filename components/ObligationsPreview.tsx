"use client";
// The recurring obligations a project will have, before it exists: how often
// each falls due and why, worked out from what the owner expects it to be.
import { sb } from "@/lib/supabase";
import { ruleState, type Profile, type Rule } from "@/lib/obligations";
import { useLoad } from "./session";
import { Loading } from "./ui";
import { num } from "@/lib/format";

const EVERY: Record<Rule["frequency"], string> = { monthly: "كل شهر", quarterly: "كل ثلاثة أشهر", annual: "كل سنة" };

function when(r: Rule) {
  const d = r.due;
  if (d.type === "fy_months") return `خلال ${d.months === 4 ? "أربعة" : d.months === 6 ? "ستة" : d.months} أشهر من نهاية السنة المالية`;
  if (d.type === "fixed") return d.month === 1 ? "قبل نهاية يناير" : d.month === 3 ? "قبل أول أبريل" : "مرة في السنة";
  if (d.type === "day") return "مع بداية الشهر التالي";
  return r.frequency === "monthly" ? "خلال الشهر التالي" : "خلال الشهر التالي لنهاية الربع";
}

export default function ObligationsPreview({ profile, title = "ماذا بعد التأسيس؟" }: { profile: Profile; title?: string }) {
  const { data: rules } = useLoad(async () => ((await sb.from("obligation_rules").select("*").eq("active", true).order("sort")).data || []) as Rule[], []);
  if (!rules) return <Loading />;
  const rows = rules.map((r) => ({ r, s: ruleState(r, profile) }));
  const mine = rows.filter((x) => x.s.state === "on"), maybe = rows.filter((x) => x.s.state === "pending"), off = rows.filter((x) => x.s.state === "off");
  const row = ({ r, s }: (typeof rows)[number]) => (
    <div key={r.id} className={`ob-row ${s.state === "off" ? "off" : s.state === "pending" ? "pending" : ""}`}>
      <span className="grow"><b>{r.title}</b>
        <small className="note">{EVERY[r.frequency]} · {when(r)} · {r.agency}</small>
        {s.reason && <small className="ob-reason">{s.reason}</small>}
        <details className="ob-why"><summary>لماذا وما المصدر؟</summary>
          <p>{r.why}</p>
          {r.source_url && <a href={r.source_url} target="_blank" rel="noopener noreferrer">{r.source_title || "المصدر"}</a>}
        </details>
      </span>
      {r.certainty === "estimated" && <span className="chip warn">تقديري</span>}
    </div>
  );
  return (
    <div className="stack">
      <h2>{title}</h2>
      <p className="note">هذه الالتزامات الدورية التي ستكون على مشروعك بعد تأسيسه، حسب إجاباتك. وبعد التأسيس ستظهر بمواعيدها الفعلية في صفحة الالتزامات، مع تذكير قبل كل موعد.</p>
      {mine.length ? mine.map(row) : <p className="empty">لا توجد التزامات دورية حسب إجاباتك.</p>}
      {maybe.length > 0 && <><h3 className="ob-sub">قد تكون عليك</h3>{maybe.map(row)}</>}
      {off.length > 0 && (
        <details className="ob-off"><summary>ليست عليك حسب إجاباتك ({num(off.length)})</summary>
          <div className="ob-group">{off.map(row)}</div></details>
      )}
    </div>
  );
}
