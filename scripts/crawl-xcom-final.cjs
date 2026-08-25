/* Final extraction pass: grid template, announcement, nav order, footer links, PLP banner colors */
const { chromium } = require("@playwright/test");
const fs = require("fs");

(async () => {
  const browser = await chromium.launch(process.env.PW_PROXY?{proxy:{server:process.env.PW_PROXY}}:{});
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto("https://shop.x.com/", { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForTimeout(2500);

  const out = await page.evaluate(() => {
    const header = document.querySelector(".header, x-header");
    const hs = header ? getComputedStyle(header) : null;

    // secondary nav item labels in order
    const navItems = [...document.querySelectorAll(".header__secondary-nav li")].map((li) => {
      const a = li.querySelector("a, button");
      return {
        label: a ? a.textContent.replace(/\s+/g, " ").trim().slice(0, 30) : li.className.slice(0, 40),
        cls: li.className.slice(0, 50),
        visibleMobile: getComputedStyle(li).display !== "none",
      };
    });

    // announcement
    const ann = document.querySelector('[class*="announcement"] .container, [class*="announcement-bar"]');
    const annText = ann ? ann.textContent.replace(/\s+/g, " ").trim().slice(0, 120) : null;
    const annBg = ann ? getComputedStyle(ann).backgroundColor : null;
    const annColor = ann ? getComputedStyle(ann).color : null;

    // collection banners precise geometry
    const collLinks = [...document.querySelectorAll('a[href*="/collections/"]')].slice(0, 4).map((a) => {
      const s = getComputedStyle(a);
      const r = a.getBoundingClientRect();
      return { href: a.getAttribute("href"), w: Math.round(r.width), h: Math.round(r.height), cls: (a.className || "").slice(0, 70) };
    });

    // banner overlay elements: find "[ ... ]" text nodes
    const brackets = [...document.querySelectorAll("*")]
      .filter((el) => /^\[.+\]$/.test(el.textContent.trim()) && el.children.length === 0)
      .slice(0, 4)
      .map((el) => {
        const s = getComputedStyle(el);
        const parent = el.closest("div, section");
        const pr = el.getBoundingClientRect();
        const sect = parent?.getBoundingClientRect();
        return {
          text: el.textContent.trim(),
          fontSize: s.fontSize,
          weight: s.fontWeight,
          color: s.color,
          letterSpacing: s.letterSpacing,
          posInParent: sect
            ? `top:${Math.round(pr.top - sect.top)} left:${Math.round(pr.left - sect.left)}`
            : null,
        };
      });

    // Shop All buttons on banners
    const shopAll = [...document.querySelectorAll('a')].filter((a) => /shop all/i.test(a.textContent)).slice(0, 3).map((a) => {
      const s = getComputedStyle(a);
      const r = a.getBoundingClientRect();
      const parent = a.closest("[class*='collection'], section, div");
      const prr = parent?.getBoundingClientRect();
      return {
        text: a.textContent.trim(),
        bg: s.backgroundColor,
        color: s.color,
        border: s.border,
        padding: s.padding,
        radius: s.borderRadius,
        fontSize: s.fontSize,
        posInParent: prr ? `bottom:${Math.round(prr.bottom - r.bottom)} left:${Math.round(r.left - prr.left)}` : null,
      };
    });

    // product card info alignment on home
    const firstCardTitle = [...document.querySelectorAll("a[href*='/products/']")].find((a) => a.textContent.trim().length > 3 && !/shop/i.test(a.textContent));
    let cardInfo = null;
    if (firstCardTitle) {
      const infoEl = firstCardTitle.parentElement;
      const s = getComputedStyle(infoEl);
      cardInfo = { align: s.textAlign, cls: (infoEl.className || "").slice(0, 60), sample: infoEl.textContent.replace(/\s+/g, " ").trim().slice(0, 80) };
    }

    // footer links
    const footLinks = [...document.querySelectorAll("footer ul a, .footer-links-list a")].map((a) => ({
      t: a.textContent.trim(),
      href: a.getAttribute("href"),
      cls: (a.className || "").slice(0, 30),
    })).slice(0, 12);
    const footInner = document.querySelector(".footer__inner, .footer");
    const footS = footInner ? getComputedStyle(footInner) : null;

    // scheme-3 colors from CSS vars
    const rootStyles = getComputedStyle(document.documentElement);
    const scheme3 = document.querySelector(".color-scheme--scheme-3");
    const s3 = scheme3 ? getComputedStyle(scheme3) : null;

    return {
      grid: hs?.gridTemplateColumns,
      justify: hs?.justifyItems,
      navItems,
      announcement: { text: annText, bg: annBg, color: annColor },
      collLinks,
      brackets,
      shopAll,
      cardInfo,
      footLinks,
      footAlign: footS ? { textAlign: footS.textAlign, padding: footS.padding } : null,
      scheme3Colors: s3 ? { bg: s3.backgroundColor, color: s3.color } : null,
    };
  });
  fs.writeFileSync("/tmp/xcom/final.json", JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 1));
  await browser.close();
})();
