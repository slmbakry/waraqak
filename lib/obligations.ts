// Recurring obligations for one company: which rules apply to it, and each
// period's due date within a window around today.
import { DAY, today } from "./format";

export type Rule = { id: string; title: string; why: string; agency: string; frequency: "monthly" | "quarterly" | "annual";
  due: { type: "month_end" | "day" | "fy_months" | "fixed"; after?: number; day?: number; months?: number; month?: number };
  applies: { entity?: "natural" | "company"; vat?: boolean; employees?: boolean; simplified?: boolean };
  certainty: "sourced" | "estimated"; source_title: string | null; source_url: string | null; checked_on: string };

export type Profile = { legal_form: string | null; vat_registered: boolean | null; has_employees: boolean | null;
  simplified_tax: boolean | null; fiscal_year_end: number };

export type Occurrence = { rule: Rule; period: string; label: string; due: Date };

const MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
const QUARTERS = ["الربع الأول", "الربع الثاني", "الربع الثالث", "الربع الرابع"];
const yr = (y: number) => y.toLocaleString("ar-EG", { useGrouping: false });

export const entityOf = (p: Profile) => (p.legal_form === "منشأة فردية" ? "natural" : "company");

// The questions still unanswered that decide which rules apply.
export const missingAnswers = (p: Profile) => ({ vat: p.vat_registered === null, employees: p.has_employees === null });

// Unknown answers keep a rule out, except the simplified regime, which is opt-in.
export const applies = (rule: Rule, p: Profile) => ruleState(rule, p).state === "on";

// Every rule gets one of three states for a company, and none is hidden:
// "on" it applies; "off" an answer rules it out, with the reason in words;
// "pending" it may apply but an answer it depends on is still unknown. A rule
// ruled out by one answer is "off" even if another is unknown. The simplified
// regime stays opt-in (unknown counts as no), as in the reminders job.
export type RuleState = { state: "on" | "off" | "pending"; reason: string };
const QUESTION = { vat: "التسجيل في ضريبة القيمة المضافة", employees: "وجود موظفين مؤمَّن عليهم" };

export function ruleState(rule: Rule, p: Profile): RuleState {
  const a = rule.applies, off: string[] = [], pending: string[] = [];
  if (a.entity && a.entity !== entityOf(p))
    off.push(a.entity === "company" ? "هذا الالتزام على الشركات، والكيان منشأة فردية." : "هذا الالتزام على صاحب المنشأة الفردية، والكيان شركة.");
  if (a.vat !== undefined) {
    if (p.vat_registered === null) pending.push(QUESTION.vat);
    else if (p.vat_registered !== a.vat) off.push(a.vat ? "غير مسجل في ضريبة القيمة المضافة." : "مسجل في ضريبة القيمة المضافة.");
  }
  if (a.employees !== undefined) {
    if (p.has_employees === null) pending.push(QUESTION.employees);
    else if (p.has_employees !== a.employees) off.push(a.employees ? "لا يوجد موظفون مؤمَّن عليهم." : "يوجد موظفون مؤمَّن عليهم.");
  }
  if (a.simplified !== undefined && !!p.simplified_tax !== a.simplified)
    off.push(a.simplified ? "هذا الموعد لمن انضم إلى النظام الضريبي المبسط." : "منضم إلى النظام الضريبي المبسط، وله موعد مختلف.");
  if (off.length) return { state: "off", reason: off[0] };
  if (pending.length) return { state: "pending", reason: `قد يكون عليك، حسب ${pending.join(" و")}.` };
  return { state: "on", reason: "" };
}

const endOfMonth = (y: number, m: number) => new Date(y, m + 1, 0); // m is 0-based and may overflow

function dueFor(rule: Rule, endYear: number, endMonth: number): Date {
  const d = rule.due;
  if (d.type === "month_end") return endOfMonth(endYear, endMonth + (d.after || 0));
  if (d.type === "day") return new Date(endYear, endMonth + (d.after || 0), d.day || 1);
  if (d.type === "fy_months") return endOfMonth(endYear, endMonth + (d.months || 0));
  return new Date(endYear + 1, (d.month || 1) - 1, d.day || 1);
}

// Every period of the rule whose due date falls from `back` days ago to `ahead` days from now.
export function occurrences(rule: Rule, p: Profile, back = 60, ahead = 365): Occurrence[] {
  const t = today().getTime(), from = t - back * DAY, to = t + ahead * DAY, out: Occurrence[] = [];
  const now = new Date(), y0 = now.getFullYear();
  if (rule.frequency === "monthly") {
    for (let i = -4; i <= 13; i++) {
      const dt = new Date(y0, now.getMonth() + i, 1), y = dt.getFullYear(), m = dt.getMonth();
      out.push({ rule, period: `${y}-${String(m + 1).padStart(2, "0")}`, label: `عن شهر ${MONTHS[m]} ${yr(y)}`, due: dueFor(rule, y, m) });
    }
  } else if (rule.frequency === "quarterly") {
    for (let y = y0 - 1; y <= y0 + 1; y++) for (let q = 0; q < 4; q++)
      out.push({ rule, period: `${y}-Q${q + 1}`, label: `عن ${QUARTERS[q]} ${yr(y)}`, due: dueFor(rule, y, q * 3 + 2) });
  } else {
    const calendar = rule.due.type === "fixed";
    for (let y = y0 - 1; y <= y0 + 1; y++) {
      const endMonth = calendar ? 11 : p.fiscal_year_end - 1;
      out.push({ rule, period: `${y}`, label: calendar || p.fiscal_year_end === 12 ? `عن سنة ${yr(y)}` : `عن السنة المالية المنتهية في ${MONTHS[endMonth]} ${yr(y)}`, due: dueFor(rule, y, endMonth) });
    }
  }
  return out.filter((o) => o.due.getTime() >= from && o.due.getTime() <= to);
}
