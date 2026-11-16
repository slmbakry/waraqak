// Public reader for fixed share links: given a link token, returns the
// company name and, for each shared document, the files it has now, each
// with a short-lived download URL. No sign-in; the token is the secret.
// A link works while it is active and before its expiry (7 days, extendable by the owner).
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info", "Access-Control-Allow-Methods": "GET, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store" } });
const URL_SECONDS = 15 * 60;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  const token = new URL(req.url).searchParams.get("t") || "";
  if (!/^[A-Za-z0-9_-]{16,40}$/.test(token)) return json({ error: "not_found" }, 404);

  const { data: share } = await db.from("company_shares").select("id,company_id,title,document_ids,file_ids,active,views,expires_at").eq("token", token).maybeSingle();
  if (!share || !share.active || new Date(share.expires_at) <= new Date()) return json({ error: "not_found" }, 404);

  const [{ data: co }, { data: docs }, { data: files }] = await Promise.all([
    db.from("companies").select("name,status").eq("id", share.company_id).maybeSingle(),
    share.document_ids.length
      ? db.from("documents").select("id,title,expires_on").eq("company_id", share.company_id).in("id", share.document_ids)
      : Promise.resolve({ data: [] }),
    db.from("company_files").select("id,document_id,name,path,mime,size,created_at").eq("company_id", share.company_id)
      .or([share.document_ids.length ? `document_id.in.(${share.document_ids.join(",")})` : "", share.file_ids.length ? `id.in.(${share.file_ids.join(",")})` : ""].filter(Boolean).join(",") || "id.is.null")
      .order("created_at"),
  ]);
  if (!co || co.status === "closed") return json({ error: "not_found" }, 404);

  const signed = await Promise.all((files || []).map(async (f) => {
    const { data } = await db.storage.from("files").createSignedUrl(f.path, URL_SECONDS, { download: f.name });
    return { ...f, url: data?.signedUrl || null };
  }));
  const fileOut = (f: typeof signed[number]) => ({ name: f.name, mime: f.mime, size: f.size, added: f.created_at, url: f.url });
  const groups = (docs || []).map((d) => ({ title: d.title, expires_on: d.expires_on, files: signed.filter((f) => f.document_id === d.id && f.url).map(fileOut) }));
  const loose = signed.filter((f) => share.file_ids.includes(f.id) && !share.document_ids.includes(f.document_id) && f.url).map(fileOut);
  if (loose.length) groups.push({ title: "مستندات أخرى", expires_on: null, files: loose });

  await db.from("company_shares").update({ views: share.views + 1, last_viewed_at: new Date().toISOString() }).eq("id", share.id);
  return json({ company: co.name, title: share.title, url_minutes: URL_SECONDS / 60, groups });
});
