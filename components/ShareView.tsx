"use client";
// The public page behind a fixed share link: the company's chosen documents
// as they are now, each file with a direct download. No sign-in needed.
import { useEffect, useState } from "react";
import { fmtDate, num } from "@/lib/format";
import { fmtSize } from "@/lib/files";
import { Brand } from "./Brand";
import { Icon, Loading } from "./ui";

const FN = (process.env.NEXT_PUBLIC_SUPABASE_URL || "https://ewbpshqntggizomdejys.supabase.co") + "/functions/v1/share";
type File = { name: string; mime: string; size: number; added: string; url: string };
type Data = { company: string; title: string; url_minutes: number; groups: { title: string; expires_on: string | null; files: File[] }[] };

export default function ShareView({ token }: { token: string }) {
  const [data, setData] = useState<Data | null | undefined>(undefined);
  useEffect(() => {
    fetch(`${FN}?t=${encodeURIComponent(token)}`).then((r) => (r.ok ? r.json() : null)).then(setData, () => setData(null));
  }, [token]);
  if (data === undefined) return <Loading />;
  if (!data) return (
    <section className="panel share-page"><h1>هذا الرابط غير متاح</h1>
      <p className="note">ربما انتهت صلاحيته، أو أوقفه صاحب الشركة أو غيّره. اطلب منه رابطًا جديدًا.</p></section>
  );
  const count = data.groups.reduce((n, g) => n + g.files.length, 0);
  return (
    <div className="share-page">
      <section className="head"><span className="eyebrow">{data.title}</span><h1>مستندات {data.company}</h1>
        <p>{count ? "اضغط على أي ملف لتنزيله. هذه أحدث نسخ المستندات كما رفعتها الشركة." : "لا توجد ملفات في هذا الرابط بعد."}</p></section>
      {data.groups.filter((g) => g.files.length).map((g) => (
        <section key={g.title} className="panel">
          <div className="row between"><h2>{g.title}</h2>{g.expires_on && <span className="chip">ساري حتى {fmtDate(g.expires_on)}</span>}</div>
          <div className="share-files">{g.files.map((f) => (
            <a key={f.url} className="share-file" href={f.url} download={f.name}>
              <span className="tile-ic"><Icon name="doc" size={20} /></span>
              <span><b><bdi>{f.name}</bdi></b><small className="note">{fmtSize(f.size)} · {fmtDate(f.added)}</small></span>
              <span className="btn small">تنزيل</span>
            </a>
          ))}</div>
        </section>
      ))}
      <p className="note share-foot">روابط التنزيل صالحة لمدة {num(data.url_minutes)} دقيقة. إذا انتهت، أعد فتح الصفحة. هذه الصفحة من منصة <Brand />.</p>
    </div>
  );
}
