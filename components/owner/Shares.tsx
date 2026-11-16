"use client";
// Fixed share links for a company: each one has a name and the documents it
// shows. Whoever opens it gets the files those documents have now, so the
// owner sends the link once and new scans reach it on their own.
import { useState } from "react";
import { sb } from "@/lib/supabase";
import { fmtDate, num } from "@/lib/format";
import type { CompanyFile } from "@/lib/files";
import { useLoad, useSession } from "../session";
import { Icon } from "../ui";

type Share = { id: string; token: string; title: string; document_ids: string[]; file_ids: string[]; active: boolean; views: number; last_viewed_at: string | null; expires_at: string };
type Doc = { id: string; title: string };

const linkOf = (token: string) => `${typeof window !== "undefined" ? window.location.origin : "https://waraqak.com"}/s/${token}`;

export default function Shares({ companyId, companyName, docs, files }: { companyId: string; companyName: string; docs: Doc[]; files: CompanyFile[] }) {
  const { toast } = useSession();
  const [n, setN] = useState(0);
  const [edit, setEdit] = useState<Share | "new" | null>(null);
  const { data } = useLoad(async () => {
    const { data } = await sb.from("company_shares").select("*").eq("company_id", companyId).order("created_at");
    return (data || []) as Share[];
  }, [companyId, n]);
  const reload = () => setN((x) => x + 1);

  const copy = async (s: Share) => {
    try { await navigator.clipboard.writeText(linkOf(s.token)); toast("تم نسخ الرابط"); }
    catch { toast("تعذّر النسخ، انسخ الرابط يدويًا", true); }
  };
  const whatsapp = (s: Share) => window.open("https://wa.me/?text=" + encodeURIComponent(`${s.title}: مستندات ${companyName}\n${linkOf(s.token)}`), "_blank", "noopener");
  const setActive = async (s: Share, active: boolean) => {
    const { error } = await sb.from("company_shares").update({ active }).eq("id", s.id);
    if (error) return toast("تعذّر الحفظ", true);
    toast(active ? "الرابط يعمل من جديد" : "أوقفنا الرابط، ولن يفتحه أحد حتى تعيد تشغيله"); reload();
  };
  // A link lasts 7 days; extending gives it 7 more from now.
  const extend = async (s: Share) => {
    const { error } = await sb.from("company_shares").update({ expires_at: new Date(Date.now() + 7 * 86400000).toISOString() }).eq("id", s.id);
    if (error) return toast("تعذّر تمديد الرابط", true);
    toast("مددنا الرابط سبعة أيام"); reload();
  };
  const expired = (s: Share) => new Date(s.expires_at) <= new Date();
  const renew = async (s: Share) => {
    if (!confirm("سيتوقف الرابط الحالي نهائيًا، وستحتاج إلى إرسال الرابط الجديد لمن تريد. هل تريد المتابعة؟")) return;
    const { error } = await sb.rpc("renew_share_token", { sid: s.id });
    if (error) return toast("تعذّر تغيير الرابط", true);
    toast("أنشأنا رابطًا جديدًا"); reload();
  };
  const remove = async (s: Share) => {
    if (!confirm(`هل تريد حذف الرابط «${s.title}»؟ لن يفتحه أحد بعد ذلك.`)) return;
    const { error } = await sb.from("company_shares").delete().eq("id", s.id);
    if (error) return toast("تعذّر الحذف", true);
    toast("حذفنا الرابط"); reload();
  };
  const count = (s: Share) => files.filter((f) => s.file_ids.includes(f.id) || (f.document_id && s.document_ids.includes(f.document_id))).length;

  return (
    <section className="panel sum">
      <h2>روابط المشاركة</h2>
      <p className="note">أنشئ رابطًا يعرض مستندات تختارها. الرابط صالح سبعة أيام، ويمكنك تمديده أو إيقافه في أي وقت. عندما ترفع نسخة جديدة من مستند، تظهر في الرابط نفسه.</p>
      {data?.map((s) => (
        <div key={s.id} className={"share-row" + (s.active ? "" : " off")}>
          <div className="row between"><b>{s.title}</b><span className="chip">{!s.active ? "متوقف" : expired(s) ? "انتهت صلاحيته" : `${num(count(s))} ملف`}</span></div>
          <small className="note">{s.views ? `فُتح ${num(s.views)} مرة، آخرها ${fmtDate(s.last_viewed_at)}` : "لم يُفتح بعد"} · {expired(s) ? "انتهت صلاحيته، مدّده ليعمل من جديد" : `صالح حتى ${fmtDate(s.expires_at)}`}</small>
          {s.active && !expired(s) && <div className="row"><button className="btn small primary" type="button" onClick={() => whatsapp(s)}>واتساب</button><button className="btn small" type="button" onClick={() => copy(s)}>نسخ الرابط</button></div>}
          <div className="row share-acts">
            <button className="linkish" type="button" onClick={() => setEdit(s)}>تعديل المستندات</button>
            <button className="linkish" type="button" onClick={() => setActive(s, !s.active)}>{s.active ? "إيقاف" : "تشغيل"}</button>
            <button className="linkish" type="button" onClick={() => extend(s)}>تمديد أسبوع</button>
            <button className="linkish" type="button" onClick={() => renew(s)}>تغيير الرابط</button>
            <button className="linkish danger" type="button" onClick={() => remove(s)}>حذف</button>
          </div>
        </div>
      ))}
      <button className="btn" type="button" onClick={() => setEdit("new")}><Icon name="plus" size={16} />رابط جديد</button>
      {edit && <ShareForm companyId={companyId} share={edit === "new" ? null : edit} docs={docs} files={files} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); }} />}
    </section>
  );
}

function ShareForm({ companyId, share, docs, files, onClose, onSaved }: { companyId: string; share: Share | null; docs: Doc[]; files: CompanyFile[]; onClose: () => void; onSaved: () => void }) {
  const { toast } = useSession();
  const [title, setTitle] = useState(share?.title || "");
  const [docIds, setDocIds] = useState<string[]>(share?.document_ids || []);
  const [fileIds, setFileIds] = useState<string[]>(share?.file_ids || []);
  const [busy, setBusy] = useState(false);
  const loose = files.filter((f) => !f.document_id);
  const flip = (list: string[], set: (v: string[]) => void, id: string) => set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  const save = async () => {
    const t = title.trim();
    if (!t) return toast("اكتب اسمًا للرابط، مثل البنك أو المورد", true);
    if (!docIds.length && !fileIds.length) return toast("اختر مستندًا واحدًا على الأقل", true);
    setBusy(true);
    const row = { title: t, document_ids: docIds, file_ids: fileIds };
    const { error } = share ? await sb.from("company_shares").update(row).eq("id", share.id) : await sb.from("company_shares").insert({ ...row, company_id: companyId });
    setBusy(false);
    if (error) return toast("تعذّر حفظ الرابط", true);
    toast(share ? "حفظنا التعديل، والرابط نفسه لم يتغير" : "أنشأنا الرابط، ويمكنك إرساله الآن"); onSaved();
  };
  return (
    <div className="fb-back" role="presentation" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <section className="panel fb-box" role="dialog" aria-modal="true" aria-labelledby="sh-t">
        <h2 id="sh-t">{share ? "تعديل الرابط" : "رابط جديد"}</h2>
        <div className="field"><label htmlFor="sh-name">اسم الرابط</label><input id="sh-name" value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} placeholder="مثلًا: مستندات البنك" /></div>
        <b>المستندات التي تظهر فيه</b>
        <div className="share-pick">
          {docs.map((d) => {
            const k = files.filter((f) => f.document_id === d.id).length;
            return <label key={d.id} className="check"><input type="checkbox" checked={docIds.includes(d.id)} onChange={() => flip(docIds, setDocIds, d.id)} />{d.title} <small className="note">{k ? `${num(k)} ملف` : "لا توجد ملفات بعد"}</small></label>;
          })}
          {loose.length > 0 && <small className="note">ملفات أخرى</small>}
          {loose.map((f) => <label key={f.id} className="check"><input type="checkbox" checked={fileIds.includes(f.id)} onChange={() => flip(fileIds, setFileIds, f.id)} />{f.name}</label>)}
          {!docs.length && !loose.length && <p className="note">أضف مستندات أو ارفع ملفات أولًا.</p>}
        </div>
        <small className="note">عند اختيار مستند، يظهر في الرابط كل ما ترفعه له الآن وفيما بعد. لإخفاء نسخة قديمة، احذفها من ملف الشركة.</small>
        <div className="row"><button className="btn primary" type="button" disabled={busy} onClick={save}>حفظ</button><button className="btn" type="button" onClick={onClose}>إلغاء</button></div>
      </section>
    </div>
  );
}
