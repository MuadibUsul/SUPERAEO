import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), browsing-topics=()" },
          // Two years, matching the value browsers require for preload lists.
          // Only meaningful over HTTPS; ignored by browsers on plain HTTP.
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
          // frame-ancestors supersedes X-Frame-Options on modern browsers, which
          // is why both are set. The rest is deliberately narrow: this app loads
          // no third-party scripts, styles, fonts or frames.
          // 'unsafe-inline' on style-src is required by Tailwind's inline styles
          // and the canvas components' computed style attributes.
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "base-uri 'self'",
              "form-action 'self'",
              "frame-ancestors 'self'",
              "object-src 'none'",
              "img-src 'self' data: blob:",
              "style-src 'self' 'unsafe-inline'",
              "font-src 'self' data:",
              "connect-src 'self'",
              // Next's runtime injects inline bootstrap scripts; 'unsafe-eval'
              // is only needed by the dev overlay and is dropped in production.
              `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "production" ? "" : " 'unsafe-eval'"}`,
            ].join("; "),
          },
        ],
      },
    ];
  },
  async redirects() {
    return [
      {
        source: "/projects",
        destination: "/zh-CN/app/projects",
        permanent: true,
      },
      {
        source: "/projects/:path*",
        destination: "/zh-CN/app/projects/:path*",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
