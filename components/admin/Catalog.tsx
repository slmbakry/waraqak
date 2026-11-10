"use client";
// Sections and services, managed without code: add a section, move a service into it,
// choose whether it is a priced procedure or a request for offers, and edit what it asks.
import { useState } from "react";
import { sb } from "@/lib/supabase";
import { num } from "@/lib/format";
import { forgetCatalog, type Category, type NeedField, type Service } from "@/lib/data";
import { useLoad, useSession } from "../session";
import { Head, Icon, LoadError, Loading } from "../ui";

const ICON_CHOICES: Record<string, string> = { idea: "مصباح", stamp: "ختم", calendar: "تقويم", clock: "ساعة", shield: "درع", doc: "ورقة", users: "أشخاص", building: "مبنى", folder: "ملف", star: "نجمة", chart: "رسم بياني", book: "كتاب", home: "بيت", list: "قائمة" };
const MODES = { procedure: "إجراء بسعر منشور", quote: "طلب عروض أسعار" };
const TYPES = { text: "نص", number: "رقم", select: "اختيار من قائمة", date: "تاريخ" };
const slug = (v: FormDataEntryValue | null) => String(v || "").trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");

export default function Catalog() {
  const { toast } = useSession();
  const [only, setOnly] = useState("");
  const { data, error, reload } = useLoad(async () => {
    const [{ data: cats, error: e1 }, { data: svcs, error: e2 }] = await Promise.all([
      sb.from("categories").select("*").order("sort"), sb.from("services").select("*").order("sort")]);
    if (e1 || e2) throw e1 || e2;
    return { cats: cats as Category[], svcs: svcs as (Service & { active: boolean; sort: number })[] };
  }, []);
  if (error) return <LoadError />;
  if (!data) return <Loading />;
  const { cats, svcs } = data;
  const done = (msg: string) => { forgetCatalog(); toast(msg); reload(); };

  const saveCat = async (e: React.FormEvent<HTMLFormElement>, id: string) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const { error } = await sb.from("categories").update({ title: String(f.get("title")).trim(), summary: String(f.get("summary") || "").trim() || null,
      icon: f.get("icon"), sort: Number(f.get("sort") || 0), active: f.get("active") === "on" }).eq("id", id);
    if (error) return toast("تعذّر حفظ القسم", true);
    done("تم حفظ القسم");
  };
  const addCat = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget, f = new FormData(form), id = slug(f.get("id"));
    if (!id) return toast("اكتب رمزًا للقسم بحروف لاتينية", true);
    const { error } = await sb.from("categories").insert({ id, title: String(f.get("title")).trim(), sort: (Math.max(0, ...cats.map((c) => c.sort)) || 0) + 10, active: false });
    if (error) return toast(error.code === "23505" ? "هذا الرمز مستخدم لقسم آخر" : "تعذّرت إضافة القسم", true);
    form.reset(); done("أضفنا القسم مخفيًا. فعّله عندما يجهز.");
  };
  const addSvc = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget, f = new FormData(form), id = slug(f.get("id"));
    if (!id) return toast("اكتب رمزًا للخدمة بحروف لاتينية", true);
    const lines = (k: string) => String(f.get(k) || "").split("\n").map((x) => x.trim()).filter(Boolean);
    const stages = lines("stages").map((l) => { const [t, d] = l.split("|"); return { title: t.trim(), days: Math.max(1, Number((d || "1").trim()) || 1) }; });
    if (!stages.length) return toast("اكتب مرحلة واحدة على الأقل", true);
    const cat = String(f.get("cat"));
    const { error } = await sb.from("services").insert({ id, title: String(f.get("title")).trim(), kind: cat, category_id: cat, mode: f.get("mode"),
      agency: String(f.get("agency") || "").trim() || "مقدم الخدمة", summary: String(f.get("summary") || "").trim() || null,
      docs: lines("docs"), stages, sort: (Math.max(0, ...svcs.map((s) => s.sort)) || 0) + 10, active: false });
    if (error) return toast(error.code === "23505" ? "هذا الرمز مستخدم لخدمة أخرى" : "تعذّرت إضافة الخدمة", true);
    form.reset(); done("أضفنا الخدمة مخفية. راجعها ثم فعّلها.");
  };
  const list = svcs.filter((s) => !only || s.category_id === only);

  return (
    <>
      <Head eyebrow="الأقسام والخدمات" title="ما تقدمه المنصة">
        <p>القسم يجمع خدمات من نوع واحد. والخدمة إما إجراء بسعر منشور، وإما طلب يرد عليه مقدمو الخدمة بعروض. أي قسم أو خدمة جديدة تُضاف مخفية حتى تفعّلها.</p>
      </Head>
      <section className="panel"><h2>الأقسام</h2>
        {cats.map((c) => (
          <form key={c.id} className="cat-row" onSubmit={(e) => saveCat(e, c.id)}>
            <span className="tile-ic"><Icon name={c.icon} /></span>
            <div className="field"><label htmlFor={`ct-${c.id}`}>الاسم</label><input id={`ct-${c.id}`} name="title" required defaultValue={c.title} /></div>
            <div className="field wide"><label htmlFor={`cs-${c.id}`}>الوصف</label><input id={`cs-${c.id}`} name="summary" defaultValue={c.summary || ""} /></div>
            <div className="field"><label htmlFor={`ci-${c.id}`}>الأيقونة</label><select id={`ci-${c.id}`} name="icon" defaultValue={c.icon}>{Object.entries(ICON_CHOICES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
            <div className="field narrow"><label htmlFor={`co-${c.id}`}>الترتيب</label><input id={`co-${c.id}`} name="sort" type="number" defaultValue={c.sort} /></div>
            <label className="check"><input type="checkbox" name="active" defaultChecked={c.active} />ظاهر</label>
            <button className="btn small" type="submit">حفظ</button>
          </form>
        ))}
        <form className="form-row" onSubmit={addCat}>
          <div className="field"><label htmlFor="nc-title">اسم قسم جديد</label><input id="nc-title" name="title" required /></div>
          <div className="field"><label htmlFor="nc-id">رمزه بحروف لاتينية</label><input id="nc-id" name="id" className="ltr" required placeholder="insurance" /></div>
          <span /><button className="btn primary" type="submit">إضافة قسم</button>
        </form>
      </section>
      <section className="panel">
        <div className="row between"><h2>الخدمات</h2>
          <select aria-label="القسم" value={only} onChange={(e) => setOnly(e.target.value)}><option value="">كل الأقسام ({num(svcs.length)})</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}</select></div>
        {list.length ? list.map((s) => <ServiceEditor key={s.id} s={s} cats={cats} onSaved={done} />) : <p className="empty">لا توجد خدمات في هذا القسم بعد.</p>}
      </section>
      <section className="panel"><h2>خدمة جديدة</h2>
        <form className="stack" onSubmit={addSvc}>
          <div className="form-row three">
            <div className="field"><label htmlFor="ns-title">اسم الخدمة</label><input id="ns-title" name="title" required /></div>
            <div className="field"><label htmlFor="ns-id">رمزها بحروف لاتينية</label><input id="ns-id" name="id" className="ltr" required /></div>
            <div className="field"><label htmlFor="ns-cat">القسم</label><select id="ns-cat" name="cat">{cats.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}</select></div>
          </div>
          <div className="form-row two">
            <div className="field"><label htmlFor="ns-mode">طريقة التقديم</label><select id="ns-mode" name="mode">{Object.entries(MODES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
            <div className="field"><label htmlFor="ns-agency">الجهة</label><input id="ns-agency" name="agency" placeholder="مقدم الخدمة" /></div>
          </div>
          <div className="field"><label htmlFor="ns-sum">وصف قصير يراه صاحب العمل</label><input id="ns-sum" name="summary" /></div>
          <div className="form-row two">
            <div className="field"><label htmlFor="ns-stages">المراحل: سطر لكل مرحلة، وبعد العلامة | مدتها بالأيام</label><textarea id="ns-stages" name="stages" rows={4} required placeholder={"استلام المستندات | 2\nالتنفيذ | 5"} /></div>
            <div className="field"><label htmlFor="ns-docs">المستندات المطلوبة: سطر لكل مستند</label><textarea id="ns-docs" name="docs" rows={4} /></div>
          </div>
          <button className="btn primary" type="submit">إضافة الخدمة</button>
        </form>
      </section>
    </>
  );
}

function ServiceEditor({ s, cats, onSaved }: { s: Service & { active: boolean }; cats: Category[]; onSaved: (msg: string) => void }) {
  const { toast } = useSession();
  const [mode, setMode] = useState(s.mode);
  const [fields, setFields] = useState<NeedField[]>(s.need_fields || []);
  const set = (i: number, patch: Partial<NeedField>) => setFields((list) => list.map((x, k) => (k === i ? { ...x, ...patch } : x)));
  const save = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const need = fields.filter((x) => x.label.trim()).map((x) => ({ ...x, label: x.label.trim(), options: x.type === "select" ? (x.options || []).map((o) => o.trim()).filter(Boolean) : undefined }));
    const validity = String(f.get("validity") || "");
    const { error } = await sb.from("services").update({ title: String(f.get("title")).trim(), category_id: f.get("cat"), mode, summary: String(f.get("summary") || "").trim() || null,
      validity_days: validity ? Number(validity) : null, active: f.get("active") === "on", need_fields: mode === "quote" ? need : [] }).eq("id", s.id);
    if (error) return toast("تعذّر حفظ الخدمة", true);
    onSaved("تم حفظ الخدمة");
  };
  const cat = cats.find((c) => c.id === s.category_id);
  return (
    <details className="svc-edit">
      <summary><b>{s.title}</b><span className="chips"><span className="chip">{cat?.title || s.category_id}</span>
        <span className={`chip ${s.mode === "quote" ? "warn" : ""}`}>{MODES[s.mode]}</span>{!s.active && <span className="chip bad">مخفية</span>}</span></summary>
      <form className="stack" onSubmit={save}>
        <div className="form-row three">
          <div className="field"><label htmlFor={`st-${s.id}`}>الاسم</label><input id={`st-${s.id}`} name="title" required defaultValue={s.title} /></div>
          <div className="field"><label htmlFor={`sc-${s.id}`}>القسم</label><select id={`sc-${s.id}`} name="cat" defaultValue={s.category_id}>{cats.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}</select></div>
          <div className="field"><label htmlFor={`sm-${s.id}`}>طريقة التقديم</label><select id={`sm-${s.id}`} value={mode} onChange={(e) => setMode(e.target.value as Service["mode"])}>{Object.entries(MODES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
        </div>
        <div className="form-row two">
          <div className="field"><label htmlFor={`ss-${s.id}`}>وصف قصير</label><input id={`ss-${s.id}`} name="summary" defaultValue={s.summary || ""} /></div>
          <div className="field"><label htmlFor={`sv-${s.id}`}>مدة السريان بالأيام، إن وُجدت</label><input id={`sv-${s.id}`} name="validity" type="number" min="1" defaultValue={s.validity_days ?? ""} /></div>
        </div>
        {mode === "quote" && (
          <div className="stack"><b>ما تسأله الخدمة لصاحب العمل قبل العروض</b>
            {fields.map((x, i) => (
              <div key={x.id} className="need-row">
                <input aria-label="السؤال" value={x.label} placeholder="السؤال" onChange={(e) => set(i, { label: e.target.value })} />
                <select aria-label="نوع الإجابة" value={x.type} onChange={(e) => set(i, { type: e.target.value as NeedField["type"] })}>{Object.entries(TYPES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
                {x.type === "select" && <input aria-label="الاختيارات" value={(x.options || []).join("، ")} placeholder="الاختيارات، بينها فاصلة" onChange={(e) => set(i, { options: e.target.value.split(/[،,]/) })} />}
                <label className="check"><input type="checkbox" checked={!!x.required} onChange={(e) => set(i, { required: e.target.checked })} />مطلوب</label>
                <button type="button" className="linkish danger" onClick={() => setFields((l) => l.filter((_, k) => k !== i))}>حذف</button>
              </div>
            ))}
            <button type="button" className="linkish" onClick={() => setFields((l) => [...l, { id: "q" + Date.now().toString(36), label: "", type: "text", required: false }])}>+ سؤال جديد</button>
          </div>
        )}
        <div className="row"><label className="check"><input type="checkbox" name="active" defaultChecked={s.active} />ظاهرة لأصحاب الأعمال</label>
          <button className="btn primary small" type="submit">حفظ</button></div>
      </form>
    </details>
  );
}
