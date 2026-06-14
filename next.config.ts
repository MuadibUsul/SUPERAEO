import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1", "localhost"],
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
