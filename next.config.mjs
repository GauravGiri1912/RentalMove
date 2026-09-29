/** @type {import('next').NextConfig} */
const nextConfig = {
  // ─── Security Headers ──────────────────────────────────────────────────────
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          // Prevent MIME-type sniffing
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Prevent clickjacking
          { key: "X-Frame-Options", value: "DENY" },
          // Disable legacy XSS filter (browser built-in, deprecated but harmless)
          { key: "X-XSS-Protection", value: "1; mode=block" },
          // Force HTTPS for 1 year (only effective in production)
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains; preload",
          },
          // Control cross-origin referrer leaks
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Restrict browser feature access
          {
            key: "Permissions-Policy",
            value: "camera=self, microphone=(), geolocation=(), payment=()",
          },
          // Content Security Policy
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // unsafe-eval needed by Next.js dev
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com",
              "img-src 'self' data: blob: https://res.cloudinary.com https://*.supabase.co",
              "media-src 'self' blob: https://res.cloudinary.com",
              "connect-src 'self' https://*.supabase.co https://api.cloudinary.com https://api.groq.com wss://*.supabase.co",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join("; "),
          },
        ],
      },
      // API routes: disable caching by default
      {
        source: "/api/(.*)",
        headers: [
          { key: "Cache-Control", value: "no-store, no-cache, must-revalidate" },
          { key: "Pragma", value: "no-cache" },
        ],
      },
    ];
  },

  // ─── Image Domains ─────────────────────────────────────────────────────────
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
      },
      {
        protocol: "https",
        hostname: "res-1.cloudinary.com",
      },
    ],
  },

  // ─── Build Hardening ───────────────────────────────────────────────────────
  // Prevent build info leakage in error messages
  generateEtags: false,

  // PoweredBy header removal
  poweredByHeader: false,

  // Strict mode for better error detection
  reactStrictMode: true,

  // ─── Experimental ─────────────────────────────────────────────────────────
  experimental: {
    // Opt in to server action size limit (2MB)
    serverActionsBodySizeLimit: "2mb",
  },
};

export default nextConfig;
