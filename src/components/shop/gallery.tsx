"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { ImageWithFallback } from "@/components/ui/image-with-fallback";
import { cn } from "@/lib/utils";
import { useT } from "@/components/shop/lang-provider";

export interface GalleryProps {
  images: string[];
  alt: string;
  className?: string;
  /** 官方 badge-list：浮于主图（非缩略图栏）左上角 */
  badges?: ReactNode;
}

/* 放大镜自定义光标(shop.x.com 同款观感) */
const CURSOR_ZOOM_IN =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='30' height='30' viewBox='0 0 24 24' fill='none' stroke='%23FFFFFF' stroke-width='2'><circle cx='10.5' cy='10.5' r='7'/><line x1='15.8' y1='15.8' x2='21' y2='21'/><line x1='7.5' y1='10.5' x2='13.5' y2='10.5'/><line x1='10.5' y1='7.5' x2='10.5' y2='13.5'/></svg>\") 15 15, zoom-in";

/**
 * 官方两级放大实测（1440×900 视口）：
 * 一级：图片高度=窗口高(900×900)，上下边贴死，仅左右可平移，光标 zoom-in；
 * 二级：×3（2700×2700），四边溢出贴边拖拽，光标 grab；再点回到适配态。
 */
const STAGE2_HEIGHT_VH = 300;
/** 拖拽位移小于该像素视为点击(切换缩放) */
const CLICK_SLOP = 6;

interface FlyFrom {
  tx: number;
  ty: number;
  s: number;
}

/**
 * Product gallery — shop.x.com（Impact 主题内嵌 PhotoSwipe）逐项对齐：
 * 官方配置：bgOpacity:1 纯黑背景 · maxZoomLevel:3 · 无计数器 · 圆形描边按钮 ·
 * 双击缩放(PhotoSwipe 默认行为) · 点击黑色背景关闭 · 滚轮切换图片。
 * 1. 主图悬停完全静态，仅放大镜光标；单击 → 灯箱从主图飞入，整图适配纯黑屏幕；
 * 2. 双击图片 → 以点击点为锚过渡放大至 2.5×；再次双击缩回适配态；
 * 3. 放大后按住拖拽 → 1:1 平移（拖拽期间禁用过渡保证跟手），带边界钳制；
 * 4. 单击图片外的黑色背景 → 关闭；滚轮 ↑↓ → 切换图片；
 * 5. 圆形 ‹ › × 按钮（多图时显示箭头）；Esc 关闭。
 *
 * 实现要点：所有 transform 统一由 React style 管理；飞入通过 flyFrom 状态注入
 * 初始矩阵，双 rAF 后置空触发过渡——绝不直接改写 DOM style，避免与 React 的
 * 样式提交互相覆盖（此前缓存图场景点击放大失效的回归根因）。
 */
export function Gallery({ images, alt, className, badges }: GalleryProps) {
  const t = useT();
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  /* 灯箱状态：stage 0=适配 · 1=高贴窗(仅横向) · 2=3×全向拖拽 */
  const [stage, setStage] = useState<0 | 1 | 2>(0);
  /** 数值级别的镜像 ref（供事件回调/特效内读取最新级别） */
  const zoomLevelRef = useRef<0 | 1 | 2>(0);
  /** 位移镜像 ref：pointerup 结算时读到的是实时值而非渲染闭包的滞后值 */
  const offsetRef = useRef({ x: 0, y: 0 });
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  /** 松手后的弹性慢速回弹（官方观感约 1 秒级） */
  const [slowSettle, setSlowSettle] = useState(false);
  const [flyFrom, setFlyFrom] = useState<FlyFrom | null>(null);

  const list = images.filter((src) => src.length > 0);
  const current = list[active] ?? list[0];

  const stageRef = useRef<HTMLDivElement | null>(null); // 主图舞台(飞入源矩形)
  const lightboxImgRef = useRef<HTMLImageElement | null>(null);
  const dragStart = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null);
  const didDragRef = useRef(false); // 拖拽过则随后的 click 不算点击
  const openedAtRef = useRef(0);
  const flyKeyRef = useRef("");

  /* ---------- 飞入定位：open/切图时执行一次 ---------- */
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, active]);

  /** 各级可拖边界：按渲染高度与原图比例解析计算（贴边钳制） */
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

  /* ---------- 键盘 / 滚动锁 ---------- */
  const close = useCallback(() => {
    setOpen(false);
    changeStage(0);
    offsetRef.current = { x: 0, y: 0 };
    setOffset({ x: 0, y: 0 });
  }, []);

  const step = useCallback(
    (dir: 1 | -1) => {
      setActive((a) => (a + dir + list.length) % list.length);
      changeStage(0);
      offsetRef.current = { x: 0, y: 0 };
    setOffset({ x: 0, y: 0 });
    },
    [list.length],
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
  };

  const changeStage = (next: 0 | 1 | 2) => {
    zoomLevelRef.current = next;
    setStage(next);
  };

  /**
   * 官方点击语义：
   * 图片外空白处（任意级别）→ 关闭灯箱回到商品详情页；
   * 图上：适配态→一级；一级→二级；二级→关闭。
   */
  const onStageClick = (e: React.MouseEvent) => {
    if (performance.now() - openedAtRef.current < 400) return;
    if ((e.target as HTMLElement).closest("button")) return;
    if (didDragRef.current) return;
    const img = lightboxImgRef.current;
    const inside =
      img &&
      (() => {
        const r = img.getBoundingClientRect();
        return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      })();
    if (!inside) return close();
    changeStage(((st): 0 | 1 | 2 => (st === 2 ? 0 : st === 0 ? 1 : 2))(zoomLevelRef.current));
    offsetRef.current = { x: 0, y: 0 };
    setOffset({ x: 0, y: 0 });
  };

  /** 滚轮 → 切换上一张/下一张(PhotoSwipe 默认 wheel 行为) */
  const onStageWheel = (e: React.WheelEvent) => {
    if (list.length < 2) return;
    if (Math.abs(e.deltaY) < 8 && Math.abs(e.deltaX) < 8) return;
    step(e.deltaY > 0 || e.deltaX > 0 ? 1 : -1); // body 已锁滚动，无需 preventDefault
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    if (performance.now() - openedAtRef.current < 400) return;
    dragStart.current = { px: e.clientX, py: e.clientY, ox: offset.x, oy: offset.y };
    didDragRef.current = false;
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
    // 官方语义：按住期间自由跟随（允许暂时拖出边界），松手时再结算；
    // 一级上下贴死 → 仅横向跟随，纵向始终为 0
    if (dragging) {
      const next = stage === 1 ? { x: st.ox + dx, y: 0 } : { x: st.ox + dx, y: st.oy + dy };
      offsetRef.current = next;
      setOffset(next);
    }
  };

  const onPointerUp = () => {
    const st = dragStart.current;
    dragStart.current = null;
    setDragging(false);
    if (!st || !dragging) return;
    const live = offsetRef.current;
    if (stage === 1) {
      // 一级：横向拉过阈值 → 居中切换上/下一张（保持放大级别）；否则弹回居中
      const SWIPE = Math.max(80, window.innerWidth * 0.12);
      if (live.x <= -SWIPE) {
        setActive((a) => (a + 1) % list.length);
        offsetRef.current = { x: 0, y: 0 };
    setOffset({ x: 0, y: 0 });
        flyKeyRef.current = `${active + 1}`; // 跳过新图的飞入动画
      } else if (live.x >= SWIPE) {
        setActive((a) => (a - 1 + list.length) % list.length);
        offsetRef.current = { x: 0, y: 0 };
    setOffset({ x: 0, y: 0 });
        flyKeyRef.current = `${active - 1}`;
      } else {
        setSlowSettle(true);
        const target = clampFor(stage, live.x, 0);
        offsetRef.current = target;
        setOffset(target);
      }
    } else if (stage === 2) {
      // 二级：只把「露出空白」的那一侧缓慢拉回贴边；仍压满的边保持原位
      const target = clampFor(stage, live.x, live.y);
      if (Math.abs(target.x - live.x) > 1 || Math.abs(target.y - live.y) > 1) {
        setSlowSettle(true);
        offsetRef.current = target;
        setOffset(target);
      }
      /* 无露白 → 原地停留，继续看细节 */
    }
  };

  /* 图片样式：flyFrom(仅适配态) > 放大级显式尺寸+平移 > 适配态 */
  /* 官方观感：拖拽中零过渡；松手弹性回弹约 1.1s 缓动；其余 300ms */
  const settleEase = "cubic-bezier(0.16, 0.84, 0.44, 1)";
  const imgClass =
    stage === 0
      ? cn("max-h-full max-w-full select-none object-contain", !dragging && "transition-transform duration-300 ease-out")
      : cn(
          "select-none",
          dragging ? "" : slowSettle ? "" : "duration-300 ease-out transition-[transform]",
        );
  const imgStyle: React.CSSProperties | undefined =
    flyFrom && stage === 0
      ? { transform: `translate(${flyFrom.tx}px, ${flyFrom.ty}px) scale(${flyFrom.s})` }
      : stage === 0
        ? undefined
        : {
            height: stage === 1 ? "100vh" : `${STAGE2_HEIGHT_VH}vh`,
            width: "auto",
            maxWidth: "none",
            transform: `translate(${offset.x}px, ${offset.y}px)`,
            transition: dragging
              ? "none"
              : slowSettle
                ? `transform 1100ms ${settleEase}`
                : undefined,
          };

  return (
    <>
      <div className={cn("flex flex-col-reverse gap-4 sm:flex-row sm:items-start sm:gap-4 lg:gap-[80px]", className)}>
        {list.length > 1 ? (
          <div
            data-testid="gallery-thumbs"
            className="flex gap-1.5 overflow-x-auto sm:w-14 sm:flex-col sm:gap-1.5 sm:overflow-visible lg:sticky lg:top-[84px] lg:self-start"
          >
            {list.map((src, i) => (
              <button
                key={`${src}-${i}`}
                type="button"
                onClick={() => setActive(i)}
                className={cn(
                  "relative h-14 w-14 shrink-0 overflow-hidden border p-px transition-colors duration-100 sm:h-12 sm:w-full",
                  i === active ? "border-foreground" : "border-transparent hover:border-input",
                )}
                aria-label={t("View image {n}", { n: i + 1 })}
              >
                <ImageWithFallback src={src} alt="" fill sizes="80px" className="object-contain" />
              </button>
            ))}
          </div>
        ) : null}

        {/* 主图 — 悬停静态，点击进灯箱 */}
        <div
          ref={stageRef}
          className="relative aspect-square w-full flex-1 overflow-hidden"
          style={{ cursor: CURSOR_ZOOM_IN }}
        >
          {badges ? (
            <div className="pointer-events-none absolute left-2 top-2 z-10 flex flex-col items-start gap-1">
              {badges}
            </div>
          ) : null}
          <button
            type="button"
            className="absolute inset-0 z-10"
            style={{ cursor: CURSOR_ZOOM_IN }}
            aria-label={t("Zoom in on image")}
            onClick={openLightbox}
          />
          <ImageWithFallback
            src={current ?? undefined}
            alt={alt}
            fill
            priority
            sizes="(max-width: 1024px) 100vw, 60vw"
            className="object-fill"
          />
        </div>
      </div>

      {/* PhotoSwipe 式灯箱 */}
      {open && current ? (
        <div
          className="fixed inset-0 z-[70] bg-white animate-in fade-in duration-200"
          role="dialog"
          aria-modal="true"
          aria-label={t("Zoom in on image")}
        >
          {/* 图片舞台 */}
          <div
            style={{ cursor: stage === 2 ? undefined : CURSOR_ZOOM_IN }}
            className={cn(
              "absolute inset-0 flex items-center justify-center overflow-hidden",
              stage === 2 && (dragging ? "cursor-grabbing" : "cursor-grab"),
            )}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={() => {
              if (!dragging) dragStart.current = null;
            }}
            onClick={onStageClick}
            onWheel={onStageWheel}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={lightboxImgRef}
              src={current}
              alt={alt}
              draggable={false}
              className={imgClass}
              style={imgStyle}
            />
          </div>

          {/* 官方布局：‹ 关闭 › 按钮组置于图片下方中央 */}
          <div className="absolute bottom-6 left-1/2 z-10 flex -translate-x-1/2 items-center gap-4 sm:bottom-8">
            {list.length > 1 ? (
              <button
                type="button"
                aria-label={t("Previous")}
                onClick={(e) => {
                  e.stopPropagation();
                  step(-1);
                }}
                className="flex h-11 w-11 items-center justify-center rounded-full border border-white/30 text-white transition-colors hover:border-white hover:bg-white/10"
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
              className="flex h-11 w-11 items-center justify-center rounded-full border border-white/30 text-white transition-colors hover:border-white hover:bg-white/10"
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
                className="flex h-11 w-11 items-center justify-center rounded-full border border-white/30 text-white transition-colors hover:border-white hover:bg-white/10"
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
