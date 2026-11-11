// The platform's social accounts, as a row of icons at the foot of every page.
const LINKS: { name: string; href: string; d: string }[] = [
  { name: "فيسبوك", href: "https://www.facebook.com/waraqak",
    d: "M13.5 21v-7.5h2.6l.4-3H13.5V8.6c0-.9.3-1.5 1.6-1.5h1.6V4.4c-.3 0-1.2-.1-2.3-.1-2.3 0-3.9 1.4-3.9 4v2.2H7.9v3h2.6V21z" },
  { name: "إنستجرام", href: "https://www.instagram.com/waraqak",
    d: "M12 7.3a4.7 4.7 0 1 0 0 9.4 4.7 4.7 0 0 0 0-9.4zm0 7.7a3 3 0 1 1 0-6 3 3 0 0 1 0 6zm4.9-8.9a1.1 1.1 0 1 0 0 2.2 1.1 1.1 0 0 0 0-2.2zM20.9 8c-.1-1.4-.4-2.7-1.4-3.6-1-1-2.2-1.3-3.6-1.4-1.4-.1-5.8-.1-7.2 0-1.4.1-2.6.4-3.6 1.4S3.7 6.6 3.6 8c-.1 1.4-.1 5.8 0 7.2.1 1.4.4 2.6 1.4 3.6s2.2 1.3 3.6 1.4c1.4.1 5.8.1 7.2 0 1.4-.1 2.6-.4 3.6-1.4 1-1 1.3-2.2 1.4-3.6.1-1.4.1-5.8 0-7.2zm-1.9 8.7a2.9 2.9 0 0 1-1.6 1.6c-1.1.4-3.8.3-5 .3s-3.9.1-5-.3a2.9 2.9 0 0 1-1.6-1.6c-.4-1.1-.3-3.8-.3-5s-.1-3.9.3-5A2.9 2.9 0 0 1 7.4 5c1.1-.4 3.8-.3 5-.3s3.9-.1 5 .3a2.9 2.9 0 0 1 1.6 1.6c.4 1.1.3 3.8.3 5s.1 3.9-.3 5z" },
  { name: "تيك توك", href: "https://www.tiktok.com/@waraqakeg",
    d: "M16.6 5.8A4.3 4.3 0 0 1 15.5 3h-3.1v12.4a2.6 2.6 0 1 1-1.8-2.5V9.7a5.7 5.7 0 1 0 4.9 5.7V9.1a7.4 7.4 0 0 0 4.3 1.4V7.4a4.3 4.3 0 0 1-3.2-1.6z" },
  { name: "لينكدإن", href: "https://www.linkedin.com/company/waraqak",
    d: "M6.9 20.5H3.6V9.4h3.3zM5.2 8a1.9 1.9 0 1 1 0-3.8 1.9 1.9 0 0 1 0 3.8zm15.3 12.5h-3.3v-5.4c0-1.3 0-2.9-1.8-2.9s-2 1.4-2 2.8v5.5h-3.3V9.4h3.1v1.5h.1c.4-.8 1.5-1.8 3.1-1.8 3.3 0 3.9 2.2 3.9 5z" },
];

export default function Social({ dark }: { dark?: boolean }) {
  return (
    <footer className={"social" + (dark ? " dark" : "")}>
      <span>تابعنا</span>
      <nav aria-label="حساباتنا على مواقع التواصل">
        {LINKS.map((l) => (
          <a key={l.href} href={l.href} target="_blank" rel="noopener noreferrer" aria-label={l.name} title={l.name}>
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d={l.d} fill="currentColor" /></svg>
          </a>
        ))}
      </nav>
    </footer>
  );
}
