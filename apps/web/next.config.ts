import type { NextConfig } from "next";

const apiBaseUrl = process.env["NEXT_PUBLIC_API_BASE_URL"] ?? "http://localhost:4000";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@knowflow/shared"],
  rewrites() {
    return Promise.resolve([
      {
        source: "/api/:path*",
        destination: `${apiBaseUrl}/:path*`,
      },
    ]);
  },
};

export default nextConfig;
