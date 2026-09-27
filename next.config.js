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
  /**
   * 开发期允许通过 127.0.0.1 / 局域网 IP 访问 dev 资源。
   * Next 16 默认把非 `localhost` 的 Host 视为跨域来源，会拦截
   * /_next/static/chunks/* 与 /_next/hmr —— 表现是页面能返回 HTML 但
   * **客户端 chunk 全部加载失败、React 永不水合**（交互全失效）。
   * 用 127.0.0.1 或局域网 IP 打开开发站时极易踩到。仅 dev 生效。
   */
  allowedDevOrigins: ["127.0.0.1", "192.168.0.100"],
  // standalone 输出用于 Docker 精简镜像
  output: "standalone",
  poweredByHeader: false,
  // @sentry/node、pdfkit 依赖运行时文件系统资源（require-in-the-middle / afm 字体数据），
  // 必须保持外部化（Turbopack 打包后 __dirname 指向错误）
  serverExternalPackages: ["@sentry/node", "pdfkit", "isomorphic-dompurify", "jsdom"],
  // isomorphic-dompurify 在 Node 端依赖 jsdom 的运行时资源（CSS 解析表等），
  // standalone 文件追踪会漏掉这些动态 require 的文件 → 生产环境 sanitizeHtml 抛
  // ChunkLoadError（商品创建/评价/退款全部 500）。显式把 jsdom 全量打进产物。
  // key 用 "**"：Next 用 picomatch(key, { contains: true }) 匹配路由，"**" 命中全部路由
  // （"/**/*" 会漏掉单段路由如 /admin）。
  outputFileTracingIncludes: {
    "**": ["./node_modules/jsdom/**/*", "./node_modules/isomorphic-dompurify/**/*"],
  },
  images: {
    // 商品/分类图片均已本地化（public/images/*），服务器可直读 → 启用 next/image 优化：
    // 按展示尺寸生成压缩图（webp/avif），避免浏览器直接拉 800KB 原图（此前整站图片总量 579MB）。
    // 注：若后续接入的远程图源服务器侧不可达，再对该图源单独设 unoptimized。
    // 本地原创 SVG 占位素材经 next/image 优化管道需要显式放行（均为我们自产的静态文件）
    dangerouslyAllowSVG: true,
    contentDispositionType: "inline",
    remotePatterns: [
      // AWS S3 直连的两种形态。此前是 `**.amazonaws.com` 全域通配（P1）：
      // 放行了任意 AWS 主机，优化器可被用作代理；项目本身并不引用 amazonaws 图源，
      // 仅为 S3 兼容部署预留。Cloudflare R2 / MinIO 自定义域名请按需追加
      // S3_PUBLIC_URL 所在主机。
      { protocol: "https", hostname: "**.s3.amazonaws.com" },
      { protocol: "https", hostname: "**.s3.**.amazonaws.com" },
      { protocol: "http", hostname: "localhost" },
      { protocol: "http", hostname: "127.0.0.1" },
      { protocol: "http", hostname: "minio" },
      // 商品图已全部本地化（public/images/**）——不再热链 shop.x.com /
      // cdn.shopify.com：第三方 CDN 随时防盗链/下架，会造成整站商品图裂图。
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
