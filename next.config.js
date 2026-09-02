/** @type {import('next').NextConfig} */

const securityHeaders = [
  {
    key: "X-DNS-Prefetch-Control",
    value: "on",
  },
  {
    key: "X-Frame-Options",
    value: "SAMEORIGIN",
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(self)",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  },
  // CSP 由 src/proxy.ts 按请求签发（Next 16 将 middleware 重命名为 proxy）：
  //   生产 → per-request nonce + strict-dynamic（收窄内联脚本）
  //   开发 → 宽松策略（HMR 需要 eval/inline），见 proxy 内联定义
];

const nextConfig = {
  reactStrictMode: true,
  // standalone 输出用于 Docker 精简镜像
  output: "standalone",
  poweredByHeader: false,
  // @sentry/node、pdfkit 依赖运行时文件系统资源（require-in-the-middle / afm 字体数据），
  // 必须保持外部化（Turbopack 打包后 __dirname 指向错误）
  serverExternalPackages: ["@sentry/node", "pdfkit"],
  images: {
    // 本地原创 SVG 占位素材经 next/image 优化管道需要显式放行（均为我们自产的静态文件）
    dangerouslyAllowSVG: true,
    contentDispositionType: "inline",
    remotePatterns: [
      { protocol: "https", hostname: "picsum.photos" },
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "**.amazonaws.com" },
      { protocol: "http", hostname: "localhost" },
      { protocol: "http", hostname: "127.0.0.1" },
      { protocol: "http", hostname: "minio" },
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

module.exports = nextConfig;
