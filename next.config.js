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
  // Stripe.js 需要 js.stripe.com；内联样式用于 Radix/Tailwind 运行时
  // unsafe-eval 仅开发环境需要(React Refresh/SWC HMR)；生产构建移除以收窄 XSS 影响
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      process.env.NODE_ENV === "production"
        ? "script-src 'self' 'unsafe-inline' https://js.stripe.com"
        : "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://picsum.photos https://images.unsplash.com https://*.amazonaws.com http://localhost:*",
      "font-src 'self' data:",
      "connect-src 'self' https://api.stripe.com http://localhost:*",
      "frame-src https://js.stripe.com https://hooks.stripe.com",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self' https://checkout.stripe.com",
    ].join("; "),
  },
];

const nextConfig = {
  reactStrictMode: true,
  // standalone 输出用于 Docker 精简镜像
  output: "standalone",
  poweredByHeader: false,
  // @sentry/node、pdfkit 依赖运行时文件系统资源（require-in-the-middle / afm 字体数据），
  // 必须保持外部化（webpack 打包后 __dirname 指向错误）
  experimental: {
    serverComponentsExternalPackages: ["@sentry/node", "pdfkit"],
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      // 路由处理器（Route Handlers）不走 RSC 编译管线，需显式外部化
      config.externals = [...(config.externals ?? []), "@sentry/node", "pdfkit"];
    }
    return config;
  },
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
  eslint: {
    // CI 中单独执行 lint，避免 build 被无关警告阻塞
    ignoreDuringBuilds: false,
  },
};

module.exports = nextConfig;
