"use client";
// "New service": everything an owner can start, grouped by section and searchable.
// Sections come from the database, so a new one appears here without new code.
import Link from "next/link";
import { useState } from "react";
import { sb } from "@/lib/supabase";
import { fmtDate } from "@/lib/format";
import { categories, docStatus, services } from "@/lib/data";
import { PATHS, SOON_PATHS } from "@/lib/paths";
import { CompanySwitch, useCompanies } from "../companies";
import { useLoad } from "../session";
import { Head, Icon, LoadError, Loading } from "../ui";

type Item = { key: string; cat: string; title: string; sub: string; href: string; tag?: string };
const PATH_CAT: Record<string, string> = { "التعديل": "amendment", "الالتزامات السنوية": "compliance", "الإنهاء": "closure" };
// Arabic letters that people type interchangeably are folded before matching.
const fold = (t: string) => t.replace(/[ً-ْـ]/g, "").replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").toLowerCase();

export function Actions() {
  const { current } = useCompanies();
  const [q, setQ] = useState("");
  const { data, error } = useLoad(async () => {
    const [cats, svcs, { data: docs }] = await Promise.all([categories(), services(),
      current ? sb.from("documents").select("*").eq("company_id", current.id) : Promise.resolve({ data: [] })]);
    return { cats, svcs, docs: (docs || []).filter((d) => svcs[d.service_id]?.kind === "renewal") };
  }, [current?.id]);
  const head = (
    <Head eyebrow={<>خدمة جديدة <CompanySwitch /></>} title="ماذا تريد أن تفعل؟">
      <p>اختر ما تريده بكلماتك. سنوضح لك المطلوب والتكلفة والمدة، ومن ينفذه.</p>
      <div className="field search"><label className="sr-only" htmlFor="cat-q">ابحث في الخدمات</label>
        <input id="cat-q" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث: تجديد، زيادة رأس المال، محاسبة..." /></div>
    </Head>
  );
  if (error) return <>{head}<LoadError /></>;
  if (!data) return <>{head}<Loading /></>;

  const items: Item[] = [
    { key: "guide", cat: "founding", title: "لدي فكرة وأريد تأسيس مشروع", sub: "أسئلة قليلة تحدد الكيان المناسب، ثم خريطة خطواتك بالتكلفة والمدة.", href: "/guide" },
    { key: "add", cat: "founding", title: "لدي شركة قائمة وأريد إضافتها", sub: "أضف مستنداتها وتواريخ انتهائها لتصلك التذكيرات.", href: "/companies/new" },
    { key: "registry", cat: "founding", title: "دليل أنشطة السجل التجاري", sub: "ابحث عن نشاطك كما يُكتب في السجل، واعرف ما يُطلب إضافته معه.", href: "/registry" },
    ...data.docs.map((d) => {
      const st = docStatus(d);
      return { key: "doc-" + d.id, cat: "renewal", title: `تجديد ${d.title}`, href: `/renew/${d.id}`,
        sub: d.expires_on ? (st.left < 0 ? `انتهى في ${fmtDate(d.expires_on)}` : `ينتهي في ${fmtDate(d.expires_on)}`) : "بلا تاريخ انتهاء" };
    }),
    ...PATHS.map((p) => ({ key: "path-" + p.id, cat: PATH_CAT[p.group] || "amendment", title: p.title, sub: p.sub, href: `/paths/${p.id}` })),
    { key: "activities", cat: "license", title: "الأنشطة التي تحتاج ترخيصًا خاصًا", sub: "مثل الاستيراد والتصدير والسمسرة العقارية والمقاولات والأغذية: الجهة والمستندات والخطوات.", href: "/activities" },
    ...Object.values(data.svcs).filter((s) => s.mode === "quote").map((s) => ({ key: "svc-" + s.id, cat: s.category_id, title: s.title, sub: s.summary || "", href: `/services/${s.id}`, tag: "بعروض أسعار" })),
  ];
  const card = (i: Item) => (
    <Link key={i.key} className="path-card" href={i.href}>{i.tag && <span className="chip warn">{i.tag}</span>}<b>{i.title}</b><small className="note">{i.sub}</small></Link>
  );
  const term = fold(q.trim());
  if (term) {
    const hits = items.filter((i) => fold(i.title + " " + i.sub).includes(term));
    return (
      <>
        {head}
        <section className="panel"><h2>نتائج البحث</h2>
          {hits.length ? <div className="section-grid">{hits.map(card)}</div> : <p className="empty">لم نجد خدمة بهذه الكلمات. جرّب كلمة أخرى، أو أخبرنا بما تحتاجه من زر الملاحظات.</p>}
        </section>
      </>
    );
  }
  const shown = data.cats.map((c) => ({ c, list: items.filter((i) => i.cat === c.id) })).filter((x) => x.list.length || x.c.id === "renewal");
  return (
    <>
      {head}
      <nav className="cat-nav" aria-label="الأقسام">{shown.map(({ c }) => <a key={c.id} href={`#cat-${c.id}`}><Icon name={c.icon} size={18} />{c.title}</a>)}</nav>
      {shown.map(({ c, list }) => (
        <section key={c.id} id={`cat-${c.id}`} className="panel cat">
          <div className="row"><span className="tile-ic"><Icon name={c.icon} /></span><span className="grow"><h2>{c.title}</h2>{c.summary && <small className="note">{c.summary}</small>}</span></div>
          {list.length ? <div className="section-grid">{list.map(card)}</div>
            : <p className="empty">{current ? "أضف مستندات الشركة لتظهر هنا إجراءات تجديدها." : "أضف شركتك أولًا لتظهر هنا تجديدات مستنداتها."}</p>}
        </section>
      ))}
      {SOON_PATHS.length > 0 && <section className="panel"><h2>قيد الإعداد</h2>
        <div className="section-grid">{SOON_PATHS.map((p) => (
          <div key={p.title} className="path-card soon" aria-disabled="true"><span className="chip">قيد الإعداد</span><b>{p.title}</b><small className="note">{p.sub}</small></div>
        ))}</div>
      </section>}
    </>
  );
}
