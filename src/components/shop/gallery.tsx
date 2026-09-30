"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { ImageWithFallback } from "@/components/ui/image-with-fallback";
import { cn } from "@/lib/utils";
import { useT } from "@/components/shop/lang-provider";

export interface GalleryProps {
  images: string[];
  alt: string;
  /** 商品 id（图随规格联动：只响应本商品的 variant:image 事件） */
  productId?: string;
  className?: string;
}

/* 放大镜自定义光标(上游参考站 同款观感) — 白色小圆 + 中间加号
   （白色：黑色/深色商品图与纯黑灯箱底上依然清晰可见，黑线会"黑图压黑线"看不见） */
const CURSOR_ZOOM_IN =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='30' height='30' viewBox='0 0 24 24' fill='none' stroke='%23ffffff' stroke-width='2'><circle cx='10.5' cy='10.5' r='7'/><line x1='15.8' y1='15.8' x2='21' y2='21'/><line x1='7.5' y1='10.5' x2='13.5' y2='10.5'/><line x1='10.5' y1='7.5' x2='10.5' y2='13.5'/></svg>\") 15 15, zoom-in";

/**
 * 官方两级放大实测（1440×900 视口）：
 * 一级：图片高度=窗口高(900×900)，仅左右拖拽切换；二级：×3 四边溢出贴边拖拽，光标 grab。
 */
const STAGE2_HEIGHT_VH = 300;
/** 拖拽位移小于该像素视为点击(切换缩放) */
const CLICK_SLOP = 6;
/** 灯箱滑动条：换片/弹回过渡（官方 PhotoSwipe 观感 ~600ms 缓动） */
const STRIP_MS = 600;
const STRIP_EASE = "cubic-bezier(0.22, 0.61, 0.36, 1)";
/** 松手换片阈值：拖过 1/3 视口，或快速甩动（官方 PhotoSwipe 速度语义） */
const SWIPE_RATIO = 0.35;
const FLICK_V = 0.5; // px/ms

interface FlyFrom {
  tx: number;
  ty: number;
  s: number;
}

/**
 * Product gallery — 上游参考站（Impact 主题内嵌 PhotoSwipe）逐项对齐：
 * 1. 主图滑动轨道（大爷需求①）：点缩略图/圆点 → 大图左右平滑滑动切换（~500ms 官方缓动），
 *    不再是原图直接硬切；
 * 2. 灯箱滑动条（大爷需求②）：适配态/一级放大态按住左键横向拖拽 → 整条跟手移动，
 *    当前图拖出视口约一半时相邻图从左/右缓慢进入显示区域（官方 slide 间距 = 视口宽，
 *    图隐藏一半时邻居恰好开始进入），松手过 1/3 视口或快速甩动 → 邻居缓动滑入正中
 *    （动画结束后无跳变换 active）；未过阈值 → 弹回居中；
 * 3. 二级（×3）保持 1:1 全向拖拽平移 + 边界钳制 + 松手慢速回弹；
 * 4. 官方点击语义：图外白色背景 → 关闭；图上：适配→一级→二级→关闭；
 * 5. 圆形 ‹ › × 按钮置于图片下方中央，Esc/方向键支持，箭头同样走滑动条动画。
 *
 * 实现要点：所有 transform 统一由 React style 管理；换片动画先缓动到邻居居中、
 * 过渡结束后再无跳变地交换 active（位置连续，绝不闪跳）；拖拽期间禁用过渡保证跟手。
 */
export function Gallery({ images, alt, productId, className }: GalleryProps) {
  const t = useT();
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  /* 图随规格联动（大爷 2026-10-01 需求）：选中颜色/规格后大图切到该组合的图。
     BuyPanel（右栏，管选中）在选中变化时广播 variant:image 事件；这里监听后
     把组合图**前置到大图首位**（官方 Shopify 行为：选颜色 → 主图切到该颜色）。 */
  const [variantImage, setVariantImage] = useState<string | null>(null);
  useEffect(() => {
    const onVariantImage = (e: Event) => {
      const detail = (e as CustomEvent).detail as
        | { image?: string | null; productId?: string }
        | null;
      if (detail?.productId && productId && detail.productId !== productId) return;
      setVariantImage(detail?.image ?? null);
    };
    window.addEventListener("variant:image", onVariantImage);
    return () => window.removeEventListener("variant:image", onVariantImage);
  }, [productId]);
  /* 灯箱状态：stage 0=适配 · 1=放大(高贴窗) · 2=3×全向拖拽 */
  const [stage, setStage] = useState<0 | 1 | 2>(0);
  const zoomLevelRef = useRef<0 | 1 | 2>(0);
  /** 灯箱视口宽（滑动条 slide 间距 = 视口宽，官方 PhotoSwipe 模型） */
  const [vw, setVw] = useState(0);

  /* 滑动条（stage 0/1）：拖拽跟手 + 换片/弹回过渡 */
  const [stripOffset, setStripOffset] = useState(0);
  const stripOffsetRef = useRef(0);
  const [stripAnimating, setStripAnimating] = useState(false);
  const stripTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* stage 2 全向拖拽（保留官方 1:1 平移 + 边界钳制 + 慢速回弹） */
  const offsetRef = useRef({ x: 0, y: 0 });
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  /** 松手后的弹性慢速回弹（官方观感约 1 秒级） */
  const [slowSettle, setSlowSettle] = useState(false);
  const [flyFrom, setFlyFrom] = useState<FlyFrom | null>(null);

  /** 图集 = 组合图前置（选中组合有图时）+ 商品主图（去重）；
   *  组合图切换时大图自动回到首位（官方行为：选颜色 → 主图切到该颜色） */
  const list = useMemo(() => {
    const base = images.filter((src) => src.length > 0);
    if (!variantImage || base.includes(variantImage)) return base;
    return [variantImage, ...base];
  }, [images, variantImage]);
  // 组合图变化 → 重置到新图（前置图在首位；无组合图时回到商品主图第一张）
  const headKey = list[0] ?? "";
  useEffect(() => {
    setActive(0);
  }, [headKey]);
  const current = list[active] ?? list[0];

  const stageRef = useRef<HTMLDivElement | null>(null); // 主图舞台(飞入源矩形)
  const lightboxImgRef = useRef<HTMLImageElement | null>(null);
  const dragStart = useRef<{
    px: number;
    py: number;
    ox: number;
    oy: number;
    sox: number;
  } | null>(null);
  const didDragRef = useRef(false); // 拖拽过则随后的 click 不算点击
  const velocityRef = useRef({ x: 0, t: 0, dx: 0 });
  const openedAtRef = useRef(0);
  const flyKeyRef = useRef("");

  /* ---------- 灯箱视口宽 / 图集预加载 ---------- */
  useEffect(() => {
    if (!open) return;
    setVw(window.innerWidth);
    const onR = () => setVw(window.innerWidth);
    window.addEventListener("resize", onR);
    // 预加载全部图集：邻居滑入时已是成品图，不闪白
    for (const src of list) {
      const im = new Image();
      im.src = src;
    }
    return () => window.removeEventListener("resize", onR);
  }, [open, list]);

  /* ---------- 飞入定位：open 时执行一次（仅适配态） ---------- */
  useEffect(() => {
    if (!open) {
      flyKeyRef.current = "";
      return;
    }
    const img = lightboxImgRef.current;
    const stage = stageRef.current;
    if (!img || !stage) return;
    const key = `${active}`;
    if (flyKeyRef.current === key) return;
    if (zoomLevelRef.current !== 0) {
      flyKeyRef.current = key;
      setFlyFrom(null);
      return;
    }

    const run = () => {
      const fit = img.getBoundingClientRect();
      if (!fit.width || !fit.height) {
        requestAnimationFrame(run); // 布局未就绪，下一帧再试
        return;
      }
      const th = stage.getBoundingClientRect();
      flyKeyRef.current = key;
      setFlyFrom({
        tx: th.left + th.width / 2 - (fit.left + fit.width / 2),
        ty: th.top + th.height / 2 - (fit.top + fit.height / 2),
        s: Math.max(0.02, th.width / Math.max(1, fit.width)),
      });
      // 双 rAF：确保初始矩阵先上屏，再置空触发过渡回正
      requestAnimationFrame(() => requestAnimationFrame(() => setFlyFrom(null)));
    };
    if (img.complete && img.naturalWidth > 0) run();
    else img.addEventListener("load", run, { once: true });
  }, [open, active]);

  /** 各级可拖边界：按渲染高度与原图比例解析计算（贴边钳制，仅 stage 2 单图平移用） */
  const clampFor = useCallback((st: 0 | 1 | 2, ox: number, oy: number) => {
    if (st === 0) return { x: 0, y: 0 };
    const img = lightboxImgRef.current;
    if (!img || !img.naturalWidth) return { x: ox, y: oy };
    const h = st === 1 ? window.innerHeight : (window.innerHeight * STAGE2_HEIGHT_VH) / 100;
    const w = h * (img.naturalWidth / img.naturalHeight);
    const maxX = Math.max(0, (w - window.innerWidth) / 2);
    if (st === 1) return { x: Math.min(maxX, Math.max(-maxX, ox)), y: 0 }; // 上下贴死
    const maxY = Math.max(0, (h - window.innerHeight) / 2);
    return {
      x: Math.min(maxX, Math.max(-maxX, ox)),
      y: Math.min(maxY, Math.max(-maxY, oy)),
    };
  }, []);

  /** 缩放级别切换（声明在 close/step 之前，避免闭包 TDZ 语义问题） */
  const changeStage = (next: 0 | 1 | 2) => {
    zoomLevelRef.current = next;
    setStage(next);
  };

  /* ---------- 键盘 / 滚动锁 ---------- */
  const close = useCallback(() => {
    if (stripTimer.current) {
      clearTimeout(stripTimer.current);
      stripTimer.current = null;
    }
    setOpen(false);
    changeStage(0);
    offsetRef.current = { x: 0, y: 0 };
    setOffset({ x: 0, y: 0 });
    stripOffsetRef.current = 0;
    setStripOffset(0);
    setStripAnimating(false);
  }, []);

  /** 灯箱换片（箭头/键盘/拖拽松手共用）：滑动条缓动到邻居居中，动画结束后无跳变换 active */
  const goTo = useCallback(
    (dir: 1 | -1) => {
      if (stripTimer.current) return; // 动画进行中忽略，防连点错乱
      const width = vw || window.innerWidth;
      setStripAnimating(true);
      stripOffsetRef.current = -dir * width;
      setStripOffset(-dir * width);
      stripTimer.current = setTimeout(() => {
        stripTimer.current = null;
        setActive((a) => {
          const next = (a + dir + list.length) % list.length;
          // 跳过新图的飞入动画（fly-in effect 以 active 为 key）——
          // 否则换片动画结束后新图会先跳到缩略图位置再飞回中心（实测抖动根因）
          flyKeyRef.current = `${next}`;
          return next;
        });
        stripOffsetRef.current = 0;
        setStripOffset(0);
        setStripAnimating(false);
      }, STRIP_MS);
    },
    [vw, list.length],
  );

  const step = useCallback(
    (dir: 1 | -1) => {
      if (stage >= 2 || list.length < 2) {
        // 深度放大态/单图：直接换片（官方 PhotoSwipe 深度放大下翻页同样直接跳）
        setActive((a) => (a + dir + list.length) % list.length);
        changeStage(0);
        offsetRef.current = { x: 0, y: 0 };
        setOffset({ x: 0, y: 0 });
        stripOffsetRef.current = 0;
        setStripOffset(0);
        return;
      }
      goTo(dir);
    },
    [stage, list.length, goTo],
  );

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (list.length > 1) {
        if (e.key === "ArrowRight") step(1);
        if (e.key === "ArrowLeft") step(-1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, list.length, close, step]);

  /** 打开灯箱 */
  const openLightbox = () => {
    openedAtRef.current = performance.now();
    setOpen(true);
    changeStage(0);
    offsetRef.current = { x: 0, y: 0 };
    setOffset({ x: 0, y: 0 });
    stripOffsetRef.current = 0;
    setStripOffset(0);
    setStripAnimating(false);
  };

  /**
   * 官方点击语义：
   * 图片外空白处（任意级别）→ 关闭灯箱回到商品详情页；
   * 图上：适配态→一级；一级→二级；二级→关闭。
   */
  const onStageClick = (e: React.MouseEvent) => {
    if (performance.now() - openedAtRef.current < 400) return;
    if (stripTimer.current) return; // 换片动画中忽略
    if ((e.target as HTMLElement).closest("button")) return;
    if (didDragRef.current) return;
    const img = lightboxImgRef.current;
    const inside =
      img &&
      (() => {
        const r = img.getBoundingClientRect();
        return (
          e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom
        );
      })();
    if (!inside) return close();
    // 官方语义：适配态→一级；一级→二级；二级→关闭（与 上游参考站 点击缩放循环一致）
    if (zoomLevelRef.current === 2) return close();
    changeStage(zoomLevelRef.current === 0 ? 1 : 2);
    offsetRef.current = { x: 0, y: 0 };
    setOffset({ x: 0, y: 0 });
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    if (performance.now() - openedAtRef.current < 400) return;
    if (stripTimer.current) return; // 换片动画中不响应新拖拽
    dragStart.current = {
      px: e.clientX,
      py: e.clientY,
      ox: offset.x,
      oy: offset.y,
      sox: stripOffsetRef.current,
    };
    didDragRef.current = false;
    velocityRef.current = { x: 0, t: performance.now(), dx: 0 };
    setSlowSettle(false);
    // 指针捕获：拖拽出元素/视口后仍能收到 move/up，官方手感的关键
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* 部分浏览器对已释放指针抛错，忽略 */
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const st = dragStart.current;
    if (!st) return;
    const dx = e.clientX - st.px;
    const dy = e.clientY - st.py;
    if (!dragging && Math.hypot(dx, dy) > CLICK_SLOP) {
      setDragging(true);
      didDragRef.current = true;
    }
    // 速度采样（松手时快速甩动也能换片，官方 PhotoSwipe 手感）
    const now = performance.now();
    const dt = now - velocityRef.current.t;
    if (dt > 16) {
      velocityRef.current = { x: (dx - velocityRef.current.dx) / Math.max(1, dt), t: now, dx };
    }
    if (!dragging) return;
    if (stage >= 2) {
      // 二级：1:1 全向平移（拖拽期间禁用过渡保证跟手），允许暂时拖出边界，松手时再结算
      const next = { x: st.ox + dx, y: st.oy + dy };
      offsetRef.current = next;
      setOffset(next);
    } else {
      // 适配态/一级放大：滑动条横向跟手（邻居图同步跟随，官方 PhotoSwipe 模型）
      const next = st.sox + dx;
      stripOffsetRef.current = next;
      setStripOffset(next);
    }
  };

  const onPointerUp = () => {
    const st = dragStart.current;
    dragStart.current = null;
    if (!st || !dragging) {
      setDragging(false);
      return;
    }
    setDragging(false);
    if (stage >= 2) {
      // 二级：只把「露出空白」的那一侧缓慢拉回贴边；仍压满的边保持原位
      const live = offsetRef.current;
      const target = clampFor(stage, live.x, live.y);
      if (Math.abs(target.x - live.x) > 1 || Math.abs(target.y - live.y) > 1) {
        setSlowSettle(true);
        offsetRef.current = target;
        setOffset(target);
      }
      /* 无露白 → 原地停留，继续看细节 */
      return;
    }
    // 适配态/一级放大：滑动条结算 —— 过 1/3 视口或快速甩动 → 邻居缓动滑入正中；否则弹回
    const live = stripOffsetRef.current - st.sox;
    const width = vw || window.innerWidth;
    const v = velocityRef.current.x;
    const passed =
      list.length > 1 &&
      (Math.abs(live) > width * SWIPE_RATIO ||
        (Math.abs(v) > FLICK_V && Math.sign(v) === Math.sign(live) && live !== 0));
    if (passed) {
      goTo(live < 0 ? 1 : -1);
    } else {
      // 弹回居中（缓动，与换片同款观感）
      setStripAnimating(true);
      stripOffsetRef.current = st.sox;
      setStripOffset(st.sox);
      stripTimer.current = setTimeout(() => {
        stripTimer.current = null;
        setStripAnimating(false);
      }, STRIP_MS);
    }
  };

  /* 图片样式：flyFrom(仅适配态当前张) > 放大级显式尺寸 > 适配态 */
  const settleEase = "cubic-bezier(0.16, 0.84, 0.44, 1)";

  return (
    <>
      <div className={cn("flex flex-row gap-8 md:gap-20", className)}>
        {/* 左侧缩略图列表 — 大屏显示，小屏隐藏（原网站小屏无缩略图列表）
            元素盒 56×56（1px 描边 + 1px 内边距 + 52px 图），盒间距 16px
            —— 均为原站实测值，见 docs/PARITY_AUDIT §二之四 */}
        {list.length > 1 ? (
          <div
            className="hidden w-14 shrink-0 flex-col gap-4 md:flex lg:sticky lg:top-24 lg:self-start"
            data-testid="gallery-thumbs"
          >
            {list.map((src, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setActive(i)}
                aria-label={t("Go to item {n}", { n: i + 1 })}
                className={cn(
                  "relative aspect-square w-full overflow-hidden border p-px transition-all duration-150",
                  i === active
                    ? "border-foreground ring-1 ring-foreground"
                    : "border-transparent opacity-60 hover:opacity-100",
                )}
              >
                <ImageWithFallback
                  src={src}
                  alt={`${alt} ${i + 1}`}
                  width={52}
                  height={52}
                  sizes="52px"
                  className="h-full w-full object-contain"
                />
              </button>
            ))}
          </div>
        ) : null}

        {/* 主图 — 大爷需求①：滑动轨道，点缩略图/圆点大图左右平滑切换（官方同款观感） */}
        <div className="min-w-0 flex-1">
          <div
            ref={stageRef}
            className="relative aspect-square w-full overflow-hidden bg-ground"
            style={{ cursor: CURSOR_ZOOM_IN }}
          >
            {/* 原网站 上游参考站 无 NEW/HOT 标签，保持一致 — badges 已移除 */}
            <button
              type="button"
              className="absolute inset-0 z-10"
              style={{ cursor: CURSOR_ZOOM_IN }}
              aria-label={t("Zoom in on image")}
              onClick={openLightbox}
            />
            {/* 移动端放大按钮 —— 原站实测：主图右上角内缩 20px 的 36px 白圆 + 深色放大镜
                （桌面端用放大镜光标提示，无此按钮；见 globals.css `.pdp-zoom-btn`） */}
            <button
              type="button"
              aria-label={t("Zoom in on image")}
              onClick={openLightbox}
              className="pdp-zoom-btn absolute right-5 top-5 z-20 h-9 w-9 items-center justify-center rounded-full bg-white text-foreground shadow-sm"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                aria-hidden="true"
              >
                <circle cx="10.5" cy="10.5" r="7" />
                <line x1="15.8" y1="15.8" x2="21" y2="21" />
                <line x1="7.5" y1="10.5" x2="13.5" y2="10.5" />
                <line x1="10.5" y1="7.5" x2="10.5" y2="13.5" />
              </svg>
            </button>
            <div
              className="flex h-full w-full transition-transform duration-500"
              style={{
                transform: `translateX(-${active * 100}%)`,
                transitionTimingFunction: STRIP_EASE,
              }}
            >
              {list.map((src, i) => (
                <div key={i} className="relative h-full w-full shrink-0">
                  {/* 轨道内全部 eager：移出视口的 slide 不触发懒加载，滑动不闪白 */}
                  <ImageWithFallback
                    src={src}
                    alt={`${alt} ${i + 1}`}
                    fill
                    priority
                    sizes="(max-width: 1024px) 100vw, 50vw"
                    className="object-contain"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* 底部圆点导航 — 小屏显示，大屏隐藏（原网站小屏有圆点导航）。
              尺寸/间距走令牌：移动端 24px 间距 + 6px 点 + 16px 点距（原站 375 实测）。 */}
          {list.length > 1 ? (
            <div
              className="mt-[var(--pdp-dots-mt)] flex justify-center gap-[var(--pdp-dots-gap)] md:hidden"
              data-testid="gallery-dots"
            >
              {list.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setActive(i)}
                  aria-label={t("Go to item {n}", { n: i + 1 })}
                  className={cn(
                    "h-[var(--pdp-dots-size)] w-[var(--pdp-dots-size)] rounded-full transition-colors",
                    i === active ? "bg-foreground" : "bg-foreground/30",
                  )}
                />
              ))}
            </div>
          ) : null}
        </div>
      </div>

      {/* PhotoSwipe 式灯箱 — 白色背景 + 黑色细描边按钮（与 上游参考站 同款） */}
      {open && current ? (
        <div
          className="fixed inset-0 z-[70] bg-white duration-200 animate-in fade-in"
          role="dialog"
          aria-modal="true"
          aria-label={t("Zoom in on image")}
        >
          {/* 图片舞台：适配态/一级放大 = 滑动条（大爷需求②拖拽换片，邻居缓动进入）；
              二级 = 单图 1:1 全向平移 */}
          <div
            style={{ cursor: stage === 2 ? undefined : CURSOR_ZOOM_IN }}
            className={cn(
              "absolute inset-0 overflow-hidden",
              stage === 2 && (dragging ? "cursor-grabbing" : "cursor-grab"),
            )}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={() => {
              if (!dragging) dragStart.current = null;
            }}
            onClick={onStageClick}
          >
            {stage < 2 ? (
              <>
                {(() => {
                  const n = list.length;
                  const W = vw || 0;
                  // 成环邻居（大爷需求）：prev/current/next 取模环绕——
                  // 拖到最后一张再拖，紧接首张从另一侧滑入；首张往回拖，末张滑入
                  const slots = [
                    { idx: (active - 1 + n) % n, off: -W, isCurrent: false },
                    { idx: active, off: 0, isCurrent: true },
                    { idx: (active + 1) % n, off: W, isCurrent: false },
                  ];
                  // n=2 时 prev 与 next 是同一张图：按 idx 去重（保留首位），避免 React key 冲突
                  const seen = new Set<number>();
                  return slots
                    .filter((s) => (seen.has(s.idx) ? false : (seen.add(s.idx), true)))
                    .map(({ idx, off, isCurrent }) => {
                      const src = list[idx];
                      return (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          key={idx}
                          ref={isCurrent ? lightboxImgRef : undefined}
                          src={src}
                          alt={alt}
                          draggable={false}
                          className={cn(
                            "absolute left-1/2 top-1/2 select-none",
                            stage === 0 && "max-h-full max-w-full object-contain",
                          )}
                          style={{
                            ...(stage === 1
                              ? { height: "100vh", width: "auto", maxWidth: "none" }
                              : {}),
                            transform: `translate(-50%, -50%) translateX(${off + stripOffset}px)`,
                            transition: dragging
                              ? "none"
                              : stripAnimating
                                ? `transform ${STRIP_MS}ms ${STRIP_EASE}`
                                : undefined,
                            ...(flyFrom && isCurrent && stage === 0
                              ? {
                                  transform: `translate(calc(-50% + ${flyFrom.tx}px), calc(-50% + ${flyFrom.ty}px)) scale(${flyFrom.s})`,
                                  transition: "none",
                                }
                              : {}),
                          }}
                        />
                      );
                    });
                })()}
              </>
            ) : (
              /* 二级（×3）：单图全向平移（官方观感：拖拽中零过渡；松手慢速回弹） */
              // eslint-disable-next-line @next/next/no-img-element
              <img
                ref={lightboxImgRef}
                src={current}
                alt={alt}
                draggable={false}
                className="absolute left-1/2 top-1/2 select-none"
                style={{
                  height: `${STAGE2_HEIGHT_VH}vh`,
                  width: "auto",
                  maxWidth: "none",
                  transform: `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px)`,
                  transition: dragging
                    ? "none"
                    : slowSettle
                      ? `transform 1100ms ${settleEase}`
                      : undefined,
                }}
              />
            )}
          </div>

          {/* 官方布局：‹ 关闭 › 按钮组置于图片下方中央 — 白底黑边黑图标 */}
          <div className="absolute bottom-6 left-1/2 z-10 flex -translate-x-1/2 items-center gap-4 sm:bottom-8">
            {list.length > 1 ? (
              <button
                type="button"
                aria-label={t("Previous")}
                onClick={(e) => {
                  e.stopPropagation();
                  step(-1);
                }}
                className="flex h-11 w-11 items-center justify-center rounded-full border border-black/15 bg-white text-foreground transition-colors hover:border-black hover:bg-muted"
              >
                <ChevronLeft className="h-5 w-5" strokeWidth={1.5} />
              </button>
            ) : null}
            <button
              type="button"
              aria-label={t("Close zoom preview")}
              onClick={(e) => {
                e.stopPropagation();
                close();
              }}
              className="flex h-11 w-11 items-center justify-center rounded-full border border-black/15 bg-white text-foreground transition-colors hover:border-black hover:bg-muted"
            >
              <X className="h-5 w-5" strokeWidth={1.5} />
            </button>
            {list.length > 1 ? (
              <button
                type="button"
                aria-label={t("Next")}
                onClick={(e) => {
                  e.stopPropagation();
                  step(1);
                }}
                className="flex h-11 w-11 items-center justify-center rounded-full border border-black/15 bg-white text-foreground transition-colors hover:border-black hover:bg-muted"
              >
                <ChevronRight className="h-5 w-5" strokeWidth={1.5} />
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
