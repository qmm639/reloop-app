/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: { serverActions: { bodySizeLimit: "10mb" } },
  // ไฟล์วิดีโอเก็บนอก repo เสมอ (โฟลเดอร์ STORAGE_DIR หรือ S3)
  outputFileTracingExcludes: { "*": ["./storage/**/*"] },
};
export default nextConfig;
