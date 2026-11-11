"use client";
// App shell: header, navigation, the admin preview bar, and the sign-in gates.
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { sb } from "@/lib/supabase";
import { pathFor, readSession } from "@/lib/storage";
import { useSession, type Role } from "./session";
import { Icon, Loading } from "./ui";
import { Consent, Login, NotInvited, SetPassword } from "./auth";
import { CompaniesProvider } from "./companies";
import FeedbackButton from "./Feedback";
import Social from "./Social";

// Each entry: path, label, icon, and "cta" for the one action that starts something new.
const NAV: Record<Role, [string, string, string, string?][]> = {
  admin: [["/", "الرئيسية", "home"], ["/admin/performance", "الأداء", "chart"], ["/admin/invites", "الدعوات", "send"], ["/admin/offices", "مقدمو الخدمة", "building"], ["/admin/catalog", "الخدمات", "list"], ["/admin/companies", "الشركات", "folder"], ["/admin/requirements", "المتطلبات", "docOk"], ["/admin/accuracy", "الدقة", "shield"], ["/admin/feedback", "الملاحظات", "chat"], ["/admin/users", "المستخدمون", "users"]],
  owner: [["/", "الرئيسية", "home"], ["/obligations", "الالتزامات", "calendar"], ["/actions", "خدمة جديدة", "plus", "cta"], ["/files", "ملف الشركة", "folder"], ["/requests", "طلباتي", "list"]],
  office: [["/", "الطلبات", "list"], ["/office/services", "خدماتي", "stamp"], ["/office/profile", "ملفي", "person"], ["/office/requirements", "المتطلبات", "shield"], ["/registry", "دليل الأنشطة", "book"]],
};

function isCurrent(href: string, path: string) {
  if (href === "/") return path === "/" || (/^\/companies\/[^/]+$/.test(path) && path !== "/companies/new");
  if (href === "/files") return path === "/files" || /^\/companies\/[^/]+\/files$/.test(path);
  if (href === "/actions") return ["/actions", "/guide", "/plan", "/companies/new", "/registry", "/activities"].includes(path) || path.startsWith("/activities/") || path.startsWith("/renew/") || path.startsWith("/paths/") || path.startsWith("/start/");
  if (href === "/requests") return path === "/requests" || path.startsWith("/requests/");
  return path === href || path.startsWith(href + "/");
}

// Each role reads its own notifications: the owner's, the office's, or the admins' shared ones.
export function scopedNotes<Q extends { eq: (c: string, v: unknown) => Q }>(q: Q, role: Role | null, uid: string, officeId: string | null): Q | null {
  if (role === "office") return officeId ? q.eq("office_id", officeId) : null;
  if (role === "owner") return q.eq("user_id", uid);
  return q.eq("for_admin", true);
}

function Bell() {
  const s = useSession();
  const [count, setCount] = useState(0);
  const path = usePathname();
  useEffect(() => {
    const q = scopedNotes(sb.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null), s.role, s.uid, s.officeId);
    if (!q) { setCount(0); return; }
    q.then(({ count }) => setCount(count || 0));
  }, [s.role, s.uid, s.officeId, s.bellVersion, path]);
  return (
    <Link className="bell" href="/alerts" aria-label="التنبيهات">
      <Icon name="bell" />
      <b hidden={!count}>{count > 9 ? "+٩" : Number(count).toLocaleString("ar-EG")}</b>
    </Link>
  );
}

// When an admin previews as an office, they pick which office to act for.
function PreviewBar() {
  const s = useSession();
  const router = useRouter();
  const [offices, setOffices] = useState<{ id: string; name: string; is_demo: boolean }[] | null>(null);
  useEffect(() => {
    if (s.viewAs !== "office" || offices) return;
    sb.from("offices").select("id,name,is_demo").eq("active", true).order("name").then(({ data }) => setOffices(data || []));
  }, [s.viewAs, offices]);
  const as = (r: Role) => { s.setViewAs(r); router.push("/"); };
  return (
    <div className={"preview" + (s.isPreview ? " on" : "")}>
      <span>وضع التجربة:</span>
      {([["admin", "مدير"], ["owner", "صاحب عمل"], ["office", "مقدم خدمة"]] as [Role, string][]).map(([r, label]) => (
        <button key={r} type="button" aria-pressed={s.viewAs === r} onClick={() => as(r)}>{label}</button>
      ))}
      {s.viewAs === "office" && (
        <select aria-label="مقدم الخدمة" value={s.previewOffice || ""} onChange={(e) => { s.setPreviewOffice(e.target.value || null); router.push("/"); }}>
          <option value="">اختر مقدم الخدمة</option>
          {(offices || []).map((o) => <option key={o.id} value={o.id}>{o.name}{o.is_demo ? " (تجريبي)" : ""}</option>)}
        </select>
      )}
      <span className="preview-note">البيانات التي تنشئها هنا تُسجَّل كبيانات تجريبية</span>
    </div>
  );
}

export default function Shell({ children }: { children: React.ReactNode }) {
  const s = useSession();
  const path = usePathname();
  const router = useRouter();

  // Old hash links (#request/…) open the matching page; sign-in tokens in the hash are left to Supabase.
  useEffect(() => {
    const h = location.hash;
    if (/^#[a-z-]+(\/[\w-]+)?$/.test(h)) router.replace(pathFor(h));
  }, [router]);

  const p = s.profile;
  const inside = !!(s.role && p?.consent_at);
  const needsPassword = s.recovery || (!s.hasPassword && readSession("rasmy-skip-password") !== "1");
  const [, redraw] = useState(0);

  // A share link opens for anyone, signed in or not, without the app around it.
  if (path.startsWith("/s/")) return (
    <>
      <header className="bar"><div className="bar-in"><Link className="brand" href="/" aria-label="ورقك"><img src="/logo-header-dark.svg" alt="ورقك" width={104} height={40} /></Link></div></header>
      <main className="wrap">{children}</main>
    </>
  );


  // Before sign-in there is no app around the page: only the "coming soon" face.
  if (!s.ready) return <main className="boot"><Loading /></main>;
  if (!p) return <Login />;

  let body: React.ReactNode;
  if (s.recovery) body = <SetPassword onDone={() => redraw((x) => x + 1)} />;
  else if (!p.role) body = <NotInvited />;
  else if (!p.consent_at) body = <Consent />;
  else if (needsPassword) body = <SetPassword onDone={() => redraw((x) => x + 1)} />;
  else body = children;

  return (
    <>
      <header className="bar">
        <div className="bar-in">
          <Link className="brand" href="/" aria-label="ورقك"><img src="/logo-header-dark.svg" alt="ورقك" width={104} height={40} /></Link>
          <span className="pilot-chip">نسخة تجريبية</span>
          <nav className={"nav" + (inside && NAV[s.role].length > 5 ? " many" : "")} aria-label="التنقل">
            {inside && NAV[s.role].map(([href, label, ic, kind]) => (
              <Link key={href} href={href} className={kind} aria-current={isCurrent(href, path) ? "page" : undefined}><Icon name={ic} size={22} />{label}</Link>
            ))}
          </nav>
          <span className="bar-gap" />
          {inside && <Bell />}
          {p && (
            <details className="acct">
              <summary aria-label="الحساب"><span className="acct-av">{(p.email || "ح").trim().charAt(0).toUpperCase()}</span></summary>
              <div className="acct-menu">
                <small className="ltr">{p.email}</small>
                {inside && s.role === "owner" && <Link href="/account"><Icon name="person" size={18} />حسابي</Link>}
                <button type="button" onClick={async () => { await sb.auth.signOut(); router.push("/"); }}><Icon name="logout" size={18} />خروج</button>
              </div>
            </details>
          )}
        </div>
      </header>
      {p?.role === "admin" && p.consent_at && <PreviewBar />}
      <div className="pilot">نسخة تجريبية بالدعوة فقط</div>
      <main className="wrap">{inside && s.role === "owner" ? <CompaniesProvider>{body}</CompaniesProvider> : body}</main>
      {inside && <Social />}
      {inside && s.role !== "admin" && <FeedbackButton />}
    </>
  );
}
