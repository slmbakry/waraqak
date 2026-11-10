"use client";
// What a service requires, each item with how many providers and owners
// confirmed it. The number opens the detail; nothing shows before a confirmation.
import { useState } from "react";
import { sb } from "@/lib/supabase";
import { fmtDate, num } from "@/lib/format";
import { PLACE_LABEL, type PlaceKind } from "@/lib/places";
import { useLoad } from "./session";
import { Loading } from "./ui";
import Trust from "./Trust";

export type ReqStat = { item_id: string; text: string; providers: number; owners: number; total: number;
  providers_here: number; owners_here: number; total_here: number; last_at: string | null };

export function useRequirementStats(serviceId: string, place: string | null) {
  return useLoad(async () => {
    const { data, error } = await sb.rpc("requirement_stats", { p_service: serviceId, p_place: place });
    if (error) throw error;
    return (data || []) as ReqStat[];
  }, [serviceId, place]);
}

const who = (providers: number, owners: number) => [
  providers && (providers === 1 ? "مقدم خدمة واحد" : `${num(providers)} من مقدمي الخدمة`),
  owners && (owners === 1 ? "صاحب شركة واحد" : `${num(owners)} من أصحاب الشركات`),
].filter(Boolean).join(" و");

function Count({ s, place, kind }: { s: ReqStat; place: string | null; kind: PlaceKind }) {
  const [open, setOpen] = useState(false);
  const here = !!place && s.total_here > 0;
  const n = here ? s.total_here : s.total;
  if (!n) return null;
  return (
    <span className="req-count">
      <button type="button" className="chip ok" aria-expanded={open} onClick={() => setOpen(!open)}
        aria-label={`أكده ${num(n)}، اعرض التفاصيل`}>{num(n)}</button>
      {open && (
        <span className="req-hint" role="tooltip">
          {here && <span>في {PLACE_LABEL[kind]} {place}: أكده {who(s.providers_here, s.owners_here)}.</span>}
          <span>{here ? "في كل الجهات" : "إجمالًا"}: أكده {who(s.providers, s.owners)}.</span>
          {s.last_at && <span>آخر تأكيد {fmtDate(s.last_at)}.</span>}
        </span>
      )}
    </span>
  );
}

export default function Requirements({ serviceId, kind, place, title = "المستندات المطلوبة" }:
  { serviceId: string; kind: PlaceKind; place?: string | null; title?: string }) {
  const { data, error } = useRequirementStats(serviceId, place || null);
  if (error) return null;
  return (
    <div className="docs">
      <b>{title}</b>
      {!data ? <Loading /> : (
        <ul className="req-list">
          {data.map((s) => <li key={s.item_id}><span>{s.text}</span><Count s={s} place={place || null} kind={kind} /></li>)}
        </ul>
      )}
      {data?.some((s) => s.total) && <small className="note">الرقم بجانب كل مستند هو عدد من أكدوا طلبه من مقدمي الخدمة وأصحاب الشركات. اضغط عليه لترى التفاصيل.</small>}
      <Trust serviceId={serviceId} />
    </div>
  );
}
