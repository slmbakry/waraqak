// The design studio page, served to admins only. The page itself never ships to the
// browser unless the caller's Supabase session belongs to an admin.
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_KEY, SUPABASE_URL } from "@/lib/supabase";
import { STUDIO_HTML } from "./html";

export const dynamic = "force-dynamic";

const deny = (status: number) => new Response(null, { status, headers: { "cache-control": "no-store" } });

export async function GET(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token) return deny(401);
  const sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data?.user) return deny(401);
  const { data: profile } = await sb.from("profiles").select("role").eq("id", data.user.id).maybeSingle();
  if (profile?.role !== "admin") return deny(403);
  return new Response(STUDIO_HTML, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" },
  });
}
