// 根因探针：为什么首页 h2 的 Reveal 观察器没有触发。
// 只测量、不断言，永远 exit 0。
//
// 现象：同一组件在 header 里 shown=true，在首页 h2 上永远 shown=false
// （opacity 0 + translate-y-4），滚到底也不触发。
// 本脚本在页面内**自建一个同参数的 IntersectionObserver**，观察同一元素，
// 看它是否会触发 —— 以此区分「observer 参数问题」与「组件根本没 observe」。
import { chromium } from "@playwright/test";

const BASE = process.env.QA_BASE || "http://localhost:3000";

const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1216, height: 900 } }).then((c) => c.newPage());
page.setDefaultTimeout(180_000);

await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(4000);

const out = await page.evaluate(
  () =>
    new Promise((resolve) => {
      const stuck = [...document.querySelectorAll("div")].find(
        (d) => /translate-y-4/.test(d.className || "") && /opacity-0/.test(d.className || ""),
      );
      if (!stuck) return resolve({ found: false });

      const r = stuck.getBoundingClientRect();
      const rec = {
        found: true,
        top: Math.round(r.top),
        bottom: Math.round(r.bottom),
        h: Math.round(r.height),
        viewportH: window.innerHeight,
        reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
        ioAvailable: typeof IntersectionObserver,
        ownEntries: [],
        manualEntries: [],
      };

      // ① 同参数自建观察器
      try {
        const io = new IntersectionObserver(
          (entries) => {
            for (const e of entries) {
              rec.ownEntries.push({
                isIntersecting: e.isIntersecting,
                ratio: Number(e.intersectionRatio.toFixed(3)),
                rootBounds: e.rootBounds
                  ? { top: Math.round(e.rootBounds.top), bottom: Math.round(e.rootBounds.bottom) }
                  : null,
                boundingTop: Math.round(e.boundingClientRect.top),
                boundingBottom: Math.round(e.boundingClientRect.bottom),
              });
            }
          },
          { threshold: 0.12, rootMargin: "0px 0px -40px 0px" },
        );
        io.observe(stuck);
      } catch (err) {
        rec.ownError = String(err);
      }

      // ② 无 rootMargin、无 threshold 的朴素观察器（对照组）
      try {
        const io2 = new IntersectionObserver((entries) => {
          for (const e of entries) {
            rec.manualEntries.push({
              isIntersecting: e.isIntersecting,
              ratio: Number(e.intersectionRatio.toFixed(3)),
            });
          }
        });
        io2.observe(stuck);
      } catch (err) {
        rec.manualError = String(err);
      }

      setTimeout(() => resolve(rec), 2000);
    }),
);

console.log("── Reveal 根因探针 ──");
console.log(JSON.stringify(out, null, 2));

await browser.close();
