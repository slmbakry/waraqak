/** @type {import('next').NextConfig} */
// Response headers that cannot break a screen: no framing by other sites, no
// MIME sniffing, and share links never leak through the Referer header.
const base = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
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
