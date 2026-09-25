import type { MetadataRoute } from "next";

const BASE_URL = (process.env.SITE_URL || "http://localhost:3000").replace(/\/$/, "");

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // /checkout 路由并不存在（结账在 /cart 内），disallow 它是死条目；
        // /distribution 是登录态个人中心，不该被索引。
        disallow: ["/admin", "/api/", "/auth", "/account", "/orders", "/distribution"],
      },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}
