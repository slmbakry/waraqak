/** @type {import('next').NextConfig} */
// Response headers. The policy lets the browser load code only from this site
// (the document reader and its libraries are in public/reader), talk only to our
// Supabase project, and take fonts from Google Fonts. No other site may frame us,
// and share links never leak through the Referer header.
const SUPABASE = "https://ewbpshqntggizomdejys.supabase.co";
const csp = [
  "default-src 'self'",
  // Next.js needs inline scripts; the reading engine needs WebAssembly and a blob worker.
  "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' blob:",
  "worker-src 'self' blob:",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  `img-src 'self' data: blob: ${SUPABASE}`,
  `connect-src 'self' data: blob: ${SUPABASE} ${SUPABASE.replace("https", "wss")}`,
  "frame-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");
const base = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
];
export default {
  reactStrictMode: true,
  async headers() {
    return [
      { source: "/:path*", headers: base },
      { source: "/s/:path*", headers: [{ key: "Referrer-Policy", value: "no-referrer" }] },
    ];
  },
};
