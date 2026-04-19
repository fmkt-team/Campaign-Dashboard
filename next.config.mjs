/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: "build-cache",
  serverExternalPackages: ["proxy-agent", "apify-client"],
};

export default nextConfig;
