/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.supabase.co" },
    ],
  },

  // ── Security headers ────────────────────────────────────────
  async headers() {
    const isDev = process.env.NODE_ENV === "development";

    const cspParts = [
      "default-src 'self'",
      // Next.js requires unsafe-inline + unsafe-eval for dev HMR;
      // tightened in production by removing 'unsafe-eval'
      isDev
        ? "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://checkout.razorpay.com"
        : "script-src 'self' 'unsafe-inline' https://checkout.razorpay.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://*.supabase.co",
      [
        "connect-src 'self'",
        "https://*.supabase.co",
        "wss://*.supabase.co",
        "https://api.groq.com",
        "https://api.inngest.com",
        "https://api.razorpay.com",
        "https://api.brevo.com",
        "https://*.upstash.io",
        "https://smtp-relay.brevo.com",
      ].join(" "),
      "font-src 'self' data:",
      "frame-src https://api.razorpay.com",
      "frame-ancestors 'none'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ];

    const headers = [
      {
        key:   "Content-Security-Policy",
        value: cspParts.join("; "),
      },
      {
        key:   "Strict-Transport-Security",
        value: "max-age=63072000; includeSubDomains; preload",
      },
      {
        key:   "X-Content-Type-Options",
        value: "nosniff",
      },
      {
        key:   "X-Frame-Options",
        value: "DENY",
      },
      {
        key:   "Referrer-Policy",
        value: "strict-origin-when-cross-origin",
      },
      {
        // camera + mic allowed on self (needed for voice recording / future video calls)
        key:   "Permissions-Policy",
        value: "camera=(self), microphone=(self), geolocation=()",
      },
    ];

    return [
      {
        // Apply to all routes
        source:  "/(.*)",
        headers,
      },
    ];
  },
};

export default nextConfig;
