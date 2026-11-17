"use client";
// The company file: scans of each document, the plan's allowance, and one
// merged file of chosen documents to share on WhatsApp.
import { useEffect, useState } from "react";
import { sb } from "@/lib/supabase";
import { fmtDate, num } from "@/lib/format";
import { buildPack, deleteCompanyFile, fmtSize, savePack, uploadCompanyFile, PACK_DAYS, type CompanyFile, type Plan } from "@/lib/files";
import { useLoad, useSession } from "../session";
import { Head, Icon, LoadError, Loading } from "../ui";
import ReadPanel from "./ReadPanel";
import Shares from "./Shares";

const ERRORS: Record<string, string> = {
  quota: "المساحة المتاحة في باقتك لا تكفي لهذا الملف. احذف ملفات لا تحتاجها، أو رقِّ باقتك.",
  too_big: "حجم الملف أكبر من ١٠ ميجابايت حتى بعد الضغط.",
  bad_type: "يمكنك رفع الصور وملفات PDF فقط.",
  bad_image: "تعذّرت قراءة هذه الصورة.",
};

export default function Files({ companyId, switcher }: { companyId: string; switcher?: React.ReactNode }) {
  const { toast } = useSession();
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [reading, setReading] = useState<string | null>(null);
  const [pack, setPack] = useState<{ file: File; url?: string } | null>(null);
  const { data, error, reload } = useLoad(async () => {
    const { data: co } = await sb.from("companies").select("id,name,plan,governorate,registry_office,tax_office,plans(*)").eq("id", companyId).maybeSingle();
    if (!co) return { co: null };
    const [{ data: docs }, { data: files }, { data: used }] = await Promise.all([
      sb.from("documents").select("id,title,expires_on,service_id").eq("company_id", companyId).order("title"),
      sb.from("company_files").select("*").eq("company_id", companyId).order("created_at"),
      sb.rpc("company_usage", { cid: companyId }),
    ]);
    const list = (files || []) as CompanyFile[];
    const images = list.filter((f) => f.mime.startsWith("image/")).map((f) => f.path);
    const { data: signed } = images.length ? await sb.storage.from("files").createSignedUrls(images, 600) : { data: [] };
    const thumbs = Object.fromEntries((signed || []).filter((s) => s.signedUrl).map((s) => [s.path, s.signedUrl]));
    return { co, plan: (co as any).plans as Plan, docs: docs || [], files: list, used: Number(used || 0), thumbs };
  }, [companyId]);

  useEffect(() => { setPack(null); }, [picked.join(",")]);

  if (error) return <LoadError />;
  if (!data) return <Loading />;
  const { co, plan, docs, files, used, thumbs } = data;
  if (!co) return <section className="panel"><p>هذه الشركة غير موجودة.</p></section>;

  const pct = Math.min(100, Math.round((used / plan.storage_bytes) * 100));
  const groups = [...docs.map((d) => ({ id: d.id as string | null, title: d.title as string })), { id: null, title: "مستندات أخرى" }];
  const chosen = files.filter((f) => picked.includes(f.id));

  const upload = async (documentId: string | null, list: FileList | null) => {
    if (!list?.length) return;
    setBusy("upload");
    let done = 0;
    for (const file of Array.from(list)) {
      try { await uploadCompanyFile(companyId, documentId, file, plan); done++; }
      catch (e) { toast(ERRORS[(e as Error).message] || "تعذّر رفع الملف، حاول مرة أخرى", true); break; }
    }
    setBusy(null);
    if (done) { toast(done === 1 ? "تم رفع الملف" : `تم رفع ${num(done)} ملفات`); reload(); }
  };
  const remove = async (f: CompanyFile) => {
    if (!confirm(`هل تريد حذف الملف «${f.name}»؟`)) return;
    try { await deleteCompanyFile(f); setPicked((p) => p.filter((x) => x !== f.id)); toast("تم حذف الملف"); reload(); }
    catch { toast("تعذّر حذف الملف", true); }
  };
  const open = async (f: CompanyFile) => {
    const { data: s, error } = await sb.storage.from("files").createSignedUrl(f.path, 300);
    if (error) return toast("تعذّر فتح الملف", true);
    window.open(s.signedUrl, "_blank", "noopener");
  };
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const make = async () => {
    setBusy("pack");
    try {
      const ordered = groups.flatMap((g) => chosen.filter((f) => f.document_id === g.id));
      const pdf = await buildPack(ordered);
      const name = `ملف ${co.name}.pdf`;
      setPack({ file: new File([pdf], name, { type: "application/pdf" }) });
    } catch { toast("تعذّر تجهيز الملف، حاول مرة أخرى", true); }
    setBusy(null);
  };
  const canShareFile = typeof navigator !== "undefined" && !!pack && !!navigator.canShare?.({ files: [pack.file] });
  const shareFile = async () => {
    try { await navigator.share({ files: [pack.file], title: pack.file.name }); }
    catch (e) { if ((e as Error).name !== "AbortError") toast("تعذّرت المشاركة، استخدم رابط واتساب", true); }
  };
  const shareLink = async () => {
    setBusy("link");
    try {
      const url = pack.url || await savePack(companyId, new Uint8Array(await pack.file.arrayBuffer()), pack.file.name);
      setPack({ ...pack, url });
      const text = `مستندات ${co.name}\n${url}\nالرابط صالح لمدة ${num(PACK_DAYS)} أيام.`;
      window.open("https://wa.me/?text=" + encodeURIComponent(text), "_blank", "noopener");
    } catch { toast("تعذّر إنشاء الرابط، حاول مرة أخرى", true); }
    setBusy(null);
  };
  const download = () => {
    const a = document.createElement("a"); a.href = URL.createObjectURL(pack.file); a.download = pack.file.name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  return (
    <>
      <Head back={switcher ? undefined : [`/companies/${companyId}`, "الرئيسية"]} eyebrow={<>{co.name} {switcher}</>} title="الخزينة">
        <p>ارفع صور مستندات شركتك واحفظها في مكان واحد. وعندما تحتاج إلى إرسالها، اختر ما تريد، وسنجمعها في ملف واحد مضغوط وواضح.</p>
      </Head>
      <section className="panel usage">
        <div className="row between"><b>المساحة المستخدمة</b><span className="chip">الباقة {plan.title}</span></div>
        <div className={"meter" + (pct >= 90 ? " bad" : pct >= 75 ? " warn" : "")} aria-hidden="true"><i style={{ width: `${Math.max(pct, used ? 2 : 0)}%` }} /></div>
        <small className="note">{fmtSize(used)} من {fmtSize(plan.storage_bytes)}{pct >= 75 ? ". اقتربت من الحد الأقصى لباقتك." : ""}</small>
      </section>
      {reading && files.find((f) => f.id === reading) && (() => {
        const f = files.find((x) => x.id === reading);
        return <ReadPanel key={f.id} file={f} company={co} doc={docs.find((d) => d.id === f.document_id) || null}
          onClose={() => setReading(null)} onSaved={() => { setReading(null); reload(); }} />;
      })()}
      <div className="split">
        <div className="split-main">
          {groups.map((g) => {
            const mine = files.filter((f) => f.document_id === g.id);
            const input = `up-${g.id || "other"}`;
            return (
              <section key={g.id || "other"} className="panel">
                <div className="row between">
                  <h2>{g.title}</h2>
                  <label className={"btn small" + (busy === "upload" ? " disabled" : "")} htmlFor={input}><Icon name="plus" size={16} />رفع صورة أو ملف</label>
                  <input id={input} type="file" accept="image/*,application/pdf" multiple hidden disabled={!!busy}
                    onChange={(e) => { upload(g.id, e.target.files); e.target.value = ""; }} />
                </div>
                {mine.length ? (
                  <div className="file-grid">
                    {mine.map((f) => (
                      <div key={f.id} className={"file-tile" + (picked.includes(f.id) ? " on" : "")}>
                        <button type="button" className="file-thumb" onClick={() => open(f)} aria-label={`عرض ${f.name}`}>
                          {thumbs[f.path] ? <img src={thumbs[f.path]} alt="" /> : <span className="file-pdf"><Icon name="doc" size={28} />{f.mime === "application/pdf" ? "PDF" : ""}</span>}
                        </button>
                        <label className="file-pick"><input type="checkbox" checked={picked.includes(f.id)} onChange={() => toggle(f.id)} />ضمن الملف المرسل</label>
                        <small className="note">{fmtSize(f.size)} · {fmtDate(f.created_at)}</small>
                        <div className="row between">
                          <button type="button" className="linkish" onClick={() => { setReading(f.id); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
                            {f.extracted ? "البيانات المقروءة" : "قراءة البيانات"}</button>
                          <button type="button" className="linkish danger" onClick={() => remove(f)}>حذف</button>
                        </div>
                        {f.extracted && <span className="chip ok">تمت القراءة: {f.extracted.label}</span>}
                      </div>
                    ))}
                  </div>
                ) : <p className="empty">لا توجد ملفات بعد.</p>}
              </section>
            );
          })}
        </div>
        <aside className="split-side">
          <section className="panel sum">
            <h2>إرسال ملف مجمّع</h2>
            <p className="note">اختر الصور والملفات من القائمة، وسنجمعها بالترتيب في ملف واحد.</p>
            <div className="kv"><span>الملفات المختارة</span><b>{num(chosen.length)}</b></div>
            {files.length > 0 && (
              <div className="row">
                <button type="button" className="linkish" onClick={() => setPicked(files.map((f) => f.id))}>اختيار الكل</button>
                {picked.length > 0 && <button type="button" className="linkish" onClick={() => setPicked([])}>إلغاء الاختيار</button>}
              </div>
            )}
            {!pack ? (
              <button className="btn primary" type="button" disabled={!chosen.length || !!busy} onClick={make}>
                {busy === "pack" ? "جارٍ تجهيز الملف" : "تجهيز الملف"}
              </button>
            ) : (
              <div className="stack">
                <small className="note">الملف جاهز: {fmtSize(pack.file.size)}</small>
                {canShareFile && <button className="btn primary" type="button" onClick={shareFile}>مشاركة الملف</button>}
                <button className={"btn" + (canShareFile ? "" : " primary")} type="button" disabled={busy === "link"} onClick={shareLink}>إرسال رابط عبر واتساب</button>
                <button className="btn" type="button" onClick={download}>تنزيل الملف</button>
                <small className="note">رابط واتساب صالح لمدة {num(PACK_DAYS)} أيام، ولا يفتحه إلا من يصله الرابط.</small>
              </div>
            )}
          </section>
          <Shares companyId={companyId} companyName={co.name} docs={docs} files={files} />
        </aside>
      </div>
    </>
  );
}
