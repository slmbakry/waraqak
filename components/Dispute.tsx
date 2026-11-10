"use client";
// Complaints on a request: the owner opens one, the provider is told, and the admin answers.
import Link from "next/link";
import { useState } from "react";
import { sb } from "@/lib/supabase";
import { fmtDate } from "@/lib/format";
import { useLoad, useSession } from "./session";

export type DisputeRow = { id: string; request_id: string; reason: string; status: string; resolution: string | null; created_at: string; resolved_at: string | null };

function Past({ list }: { list: DisputeRow[] }) {
  return <>{list.map((d) => (
    <div key={d.id} className="dispute">
      <div className="row between"><b>{d.status === "open" ? "شكوى قيد مراجعة الإدارة" : "شكوى أُغلقت"}</b><small className="note">{fmtDate(d.created_at)}</small></div>
      <p>{d.reason}</p>
      {d.resolution && <div className="terms"><small className="note">رد الإدارة{d.resolved_at ? ` · ${fmtDate(d.resolved_at)}` : ""}</small><p>{d.resolution}</p></div>}
    </div>
  ))}</>;
}

// The owner's side: past complaints, and a way to open one while none is open.
export function DisputeBox({ requestId, list, canOpen, onChange }: { requestId: string; list: DisputeRow[]; canOpen: boolean; onChange: () => void }) {
  const { toast } = useSession();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const hasOpen = list.some((d) => d.status === "open");
  if (!list.length && !canOpen) return null;
  const send = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const reason = String(new FormData(e.currentTarget).get("reason") || "").trim();
    if (reason.length < 10) return toast("اشرح المشكلة في جملة أو اثنتين على الأقل", true);
    setBusy(true);
    const { error } = await sb.from("disputes").insert({ request_id: requestId, reason });
    setBusy(false);
    if (error) return toast("تعذّر إرسال الشكوى، حاول مرة أخرى", true);
    setOpen(false); toast("وصلت شكواك إلى الإدارة، وسنرد عليك هنا"); onChange();
  };
  return (
    <section className="panel">
      {list.length > 0 && <><h2>الشكاوى</h2><Past list={list} /></>}
      {canOpen && !hasOpen && (open ? (
        <form className="stack" onSubmit={send}>
          <div className="field"><label htmlFor="dp-reason">ما المشكلة؟ وما الذي تطلبه لحلها؟</label><textarea id="dp-reason" name="reason" rows={4} maxLength={2000} required autoFocus /></div>
          <small className="note">تصل الشكوى إلى إدارة المنصة ويُبلَّغ بها مقدم الخدمة. جرّب الرسائل أولًا إن كانت المشكلة بسيطة.</small>
          <div className="row"><button className="btn danger-solid small" type="submit" disabled={busy}>إرسال الشكوى</button><button className="btn small" type="button" onClick={() => setOpen(false)}>إلغاء</button></div>
        </form>
      ) : <button className="linkish report" type="button" onClick={() => setOpen(true)}>لدي شكوى على هذا الطلب</button>)}
    </section>
  );
}

// The provider's side: told that a complaint exists and what the admin decided.
export function DisputeNotice({ list }: { list: DisputeRow[] }) {
  if (!list.length) return null;
  return <section className="panel"><h2>شكاوى صاحب العمل</h2><Past list={list} /></section>;
}

// The admin's queue.
export function AdminDisputes() {
  const { toast } = useSession();
  const { data, reload } = useLoad(async () => (await sb.from("disputes").select("*").eq("status", "open").order("created_at")).data as DisputeRow[] || [], []);
  if (!data?.length) return null;
  const resolve = async (e: React.FormEvent<HTMLFormElement>, id: string) => {
    e.preventDefault();
    const resolution = String(new FormData(e.currentTarget).get("resolution") || "").trim();
    if (resolution.length < 5) return toast("اكتب ما قررته ليصل إلى الطرفين", true);
    const { error } = await sb.from("disputes").update({ status: "resolved", resolution }).eq("id", id);
    if (error) return toast("تعذّر حفظ الرد", true);
    toast("أُغلقت الشكوى، ووصل ردك إلى الطرفين"); reload();
  };
  return (
    <section className="panel"><h2>شكاوى مفتوحة</h2>
      {data.map((d) => (
        <form key={d.id} className="fb-row" onSubmit={(e) => resolve(e, d.id)}>
          <div className="row between"><small className="note">{fmtDate(d.created_at)}</small><Link className="link" href={`/requests/${d.request_id}`}>فتح الطلب</Link></div>
          <p>{d.reason}</p>
          <div className="field"><label htmlFor={`dr-${d.id}`}>قرارك، ويصل إلى صاحب العمل ومقدم الخدمة</label><textarea id={`dr-${d.id}`} name="resolution" rows={2} maxLength={2000} required /></div>
          <button className="btn primary small" type="submit">إغلاق الشكوى بهذا الرد</button>
        </form>
      ))}
    </section>
  );
}
