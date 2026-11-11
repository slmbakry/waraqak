"use client";
// Fees that follow the company's capital: the owner types the capital and sees each part worked
// out. Parts fixed by law are added up; parts we have not confirmed are listed apart, not hidden.
import { useState } from "react";
import { money, num } from "@/lib/format";
import type { FeePart } from "@/lib/data";

const amount = (p: FeePart, capital: number) => {
  if (p.value === null || p.value === undefined) return null;
  if (p.kind === "fixed") return p.value;
  const raw = (capital * p.value) / 100;
  return Math.round(Math.min(p.max ?? Infinity, Math.max(p.min ?? 0, raw)));
};
const rate = (v: number) => (v >= 1 ? `${num(v)} في المائة` : `${num(v * 10)} في الألف`);
const how = (p: FeePart) => {
  if (p.kind === "fixed") return p.value === null ? "" : "مبلغ ثابت";
  const lim = [p.min != null && `لا يقل عن ${num(p.min)}`, p.max != null && `لا يزيد على ${num(p.max)}`].filter(Boolean).join(" و");
  return `${rate(p.value)} من رأس المال${lim ? `، ${lim} جنيه` : ""}`;
};

export default function FeeCalc({ parts }: { parts: FeePart[] }) {
  const [text, setText] = useState("100000");
  const capital = Math.max(0, Number(text) || 0);
  const byKind = (list: FeePart[]) => [...list.filter((p) => p.kind === "percent"), ...list.filter((p) => p.kind === "fixed")];
  const sure = byKind(parts.filter((p) => p.sure)), open = byKind(parts.filter((p) => !p.sure));
  const total = sure.reduce((a, p) => a + (amount(p, capital) || 0), 0);
  const row = (p: FeePart) => {
    const v = amount(p, capital);
    return (
      <tr key={p.label}><td><b>{p.label}</b><small className="note">{[how(p), p.note].filter(Boolean).join(". ")}</small></td>
        <td className="fee-v">{v === null ? "غير محدد بعد" : capital || p.kind === "fixed" ? money(v) : "—"}</td></tr>
    );
  };
  return (
    <div className="fee-calc">
      <b>احسب الرسوم لرأس مالك</b>
      <div className="field"><label htmlFor="fc-cap">رأس المال بالجنيه</label>
        <input id="fc-cap" type="number" min="0" step="1000" inputMode="numeric" value={text} onChange={(e) => setText(e.target.value)} /></div>
      <div className="table-wrap"><table>
        <tbody>
          {sure.map(row)}
          <tr className="fee-total"><td><b>الرسوم المؤكدة</b><small className="note">نسبها وحدودها منصوص عليها في القانون</small></td><td className="fee-v">{money(total)}</td></tr>
        </tbody>
      </table></div>
      {open.length > 0 && (
        <>
          <b>رسوم أخرى لم نتأكد من قيمتها</b>
          <small className="note">ستدفعها في الغالب، لكن المصادر تختلف في قيمتها، فلم نضفها إلى الإجمالي. الأرقام تقدير لا يُعتمد عليه.</small>
          <div className="table-wrap"><table><tbody>{open.map(row)}</tbody></table></div>
        </>
      )}
      <small className="note">هذه رسوم حكومية فقط، ولا تشمل أتعاب من ينفذ لك التأسيس.</small>
    </div>
  );
}
