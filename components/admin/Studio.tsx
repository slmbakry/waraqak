"use client";
// Design studio for social images. The page is fetched with the admin's session
// and shown in a frame, so it is never public.
import { useEffect, useState } from "react";
import { sb } from "@/lib/supabase";
import { Loading } from "../ui";

export function Studio() {
  const [html, setHtml] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let off = false;
    (async () => {
      const { data: { session } } = await sb.auth.getSession();
      if (!session) throw new Error("no session");
      const res = await fetch("/api/studio", { headers: { Authorization: `Bearer ${session.access_token}` }, cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const text = await res.text();
      if (!off) setHtml(text);
    })().catch(() => { if (!off) setFailed(true); });
    return () => { off = true; };
  }, []);
  if (failed) return <p className="empty">تعذّر فتح استوديو التصميم. حدّث الصفحة وحاول مرة أخرى.</p>;
  if (!html) return <Loading />;
  return (
    <iframe
      title="استوديو التصميم"
      srcDoc={html}
      sandbox="allow-scripts allow-same-origin allow-downloads"
      style={{ display: "block", width: "100%", height: "calc(100vh - 120px)", minHeight: 640, border: 0, borderRadius: 14, background: "#F5F7FA" }}
    />
  );
}
