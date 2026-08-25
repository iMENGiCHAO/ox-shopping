"use client";

import React, { useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Facebook,
  Link2,
  Mail,
  MessageCircle,
  Plus,
  Send,
  Share2,
  Twitter,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { useShopLang } from "@/components/shop/lang-provider";
import { firstImage } from "@/components/shop/types";
import QRCode from "qrcode";

type TFn = (k: string) => string;

/**
 * 商品卡右下角「+」：打开分享面板。
 * 分享的是「链接商品卡」——多图可切换、介绍节选作为分享文案置于最前，
 * 走 Web Share API（title/介绍/text + 商品链接）或复制链接，不再生成图片。
 */
export function ProductShareMenu({
  productId,
  productName,
  priceText,
  imageUrl,
  description = "",
  compareAtText,
  images,
}: {
  productId: string;
  productName: string;
  priceText: string;
  imageUrl?: string;
  description?: string;
  compareAtText?: string | null;
  images?: string[];
}) {
  const { t } = useShopLang() as unknown as { t: TFn };
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [copied, setCopied] = useState(false);
  const [wxOpen, setWxOpen] = useState(false);
  const [wxQr, setWxQr] = useState("");
  const [mounted, setMounted] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);

  React.useEffect(() => setMounted(true), []);

  const list = images && images.length > 0
    ? images
    : imageUrl
      ? [imageUrl]
      : [];
  const current = list[Math.min(active, Math.max(0, list.length - 1))] ?? imageUrl ?? "";

  // SSR 时无 window：仅在客户端事件里真正用到完整 URL，渲染期安全降级
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const url = `${origin}/products/${productId}`;
  const intro = description.replace(/\s+/g, " ").trim();
  // 介绍节选置于分享文案最前
  const shareText = intro ? `${intro}\n\n${productName} — ${priceText}\n${url}` : `${productName} — ${priceText}\n${url}`;

  const share = async () => {
    const nav = navigator as Navigator & { share?: (d: unknown) => Promise<void> };
    if (nav.share) {
      try {
        await nav.share({ title: productName, text: shareText, url });
        setOpen(false);
        return;
      } catch {
        /* 用户取消分享 */
        return;
      }
    }
    // 桌面无 Web Share → 复制链接
    try {
      await navigator.clipboard.writeText(url);
      toast.success(t("Link copied"));
    } catch {
      toast.error(t("Copy failed, please copy the link manually"));
    }
  };

  const enc = encodeURIComponent;
  const shareTextShort = intro ? `${intro.slice(0, 80)}${intro.length > 80 ? "…" : ""}` : productName;
  const platforms = [
    { key: "x", label: "X", icon: Twitter, href: `https://twitter.com/intent/tweet?text=${enc(shareTextShort)}&url=${enc(url)}` },
    { key: "fb", label: "Facebook", icon: Facebook, href: `https://www.facebook.com/sharer/sharer.php?u=${enc(url)}` },
    { key: "wa", label: "WhatsApp", icon: MessageCircle, href: `https://wa.me/?text=${enc(`${shareTextShort}\n${url}`)}` },
    { key: "tg", label: "Telegram", icon: Send, href: `https://t.me/share/url?url=${enc(url)}&text=${enc(shareTextShort)}` },
    { key: "mail", label: "Email", icon: Mail, href: `mailto:?subject=${enc(productName)}&body=${enc(shareText)}` },
    { key: "wb", label: "Weibo", icon: Share2, href: `https://service.weibo.com/share/share.php?url=${enc(url)}&title=${enc(shareTextShort)}` },
  ];

  const openWx = async () => {
    try {
      const dataUrl = await QRCode.toDataURL(url, { width: 480, margin: 1 });
      setWxQr(dataUrl);
      setWxOpen(true);
    } catch {
      toast.error(t("Could not generate QR code"));
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success(t("Link copied"));
    } catch {
      toast.error(t("Copy failed, please copy the link manually"));
    }
  };

  return (
    <>
      <button
        type="button"
        aria-label={t("Share product card")}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
        className="flex h-9 w-9 items-center justify-center rounded-full border border-black/10 bg-background text-foreground transition-[background-color,color,transform] duration-200 hover:bg-primary hover:text-primary-foreground [&:hover_svg]:rotate-90 [&_svg]:transition-transform [&_svg]:duration-300"
      >
        <Plus className="h-4 w-4" strokeWidth={1.5} />
      </button>

      {open && mounted
        ? createPortal(
            <div
              className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 p-4"
              onClick={() => setOpen(false)}
              role="dialog"
              aria-modal="true"
              aria-label={t("Share product card")}
            >
              <div
                ref={panelRef}
                className="relative w-full max-w-[400px] overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                {/* 头：关闭 */}
                <div className="flex items-center justify-between border-b border-border px-5 py-3">
                  <p className="text-[14px] font-medium text-foreground">{t("Share product card")}</p>
                  <button
                    type="button"
                    aria-label={t("Cancel")}
                    onClick={() => setOpen(false)}
                    className="flex h-8 w-8 items-center justify-center rounded-full text-foreground/60 transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {/* 商品卡主体（链接卡片，非图片） */}
                <div className="px-5 py-4">
                  <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-muted">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={current}
                      alt={productName}
                      className="h-full w-full object-contain"
                      key={current}
                    />
                    {list.length > 1 ? (
                      <>
                        <button
                          type="button"
                          aria-label={t("Previous")}
                          onClick={() => setActive((a) => (a - 1 + list.length) % list.length)}
                          className="absolute left-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-background/90 text-foreground shadow-sm transition-colors hover:bg-background"
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          aria-label={t("Next")}
                          onClick={() => setActive((a) => (a + 1) % list.length)}
                          className="absolute right-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-background/90 text-foreground shadow-sm transition-colors hover:bg-background"
                        >
                          <ChevronRight className="h-4 w-4" />
                        </button>
                        {/* 图片序号 */}
                        <span className="absolute bottom-2 right-2 rounded-full bg-black/50 px-2 py-0.5 text-[10px] text-white">
                          {active + 1}/{list.length}
                        </span>
                      </>
                    ) : null}
                  </div>

                  {/* 名称 / 价格（含划线原价） */}
                  <div className="mt-3 flex items-start justify-between gap-3">
                    <p className="min-w-0 text-[15px] font-medium leading-snug text-foreground">{productName}</p>
                    <p className="shrink-0 text-[15px] text-foreground">
                      {priceText}
                      {compareAtText && compareAtText !== priceText ? (
                        <span className="ml-1.5 text-[12px] text-muted-foreground line-through">{compareAtText}</span>
                      ) : null}
                    </p>
                  </div>

                  {/* 介绍节选：作为分享前置介绍展示 */}
                  {intro ? (
                    <p className="mt-2 line-clamp-3 text-[12px] leading-relaxed text-foreground/60">{intro}</p>
                  ) : null}

                  {/* 链接 */}
                  <p className="mt-2 flex items-center gap-1.5 truncate text-[11px] text-muted-foreground">
                    <Link2 className="h-3 w-3 shrink-0" />
                    <span className="truncate">{url}</span>
                  </p>
                </div>

                {/* 自媒体平台矩阵（微信二维码/邮件/X/Facebook/WhatsApp/Telegram/微博） */}
                <div className="border-t border-border px-5 pt-4">
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{t("Share to")}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void openWx()}
                      className="flex h-9 items-center gap-1.5 rounded-full border border-green-600/30 bg-green-50 px-3 text-[12px] text-green-700 transition-colors hover:bg-green-100"
                    >
                      <MessageCircle className="h-3.5 w-3.5" />
                      {t("WeChat")}
                    </button>
                    {platforms.map((p) => (
                      <a
                        key={p.key}
                        href={p.href}
                        target={p.key === "mail" ? undefined : "_blank"}
                        rel="noreferrer"
                        className="flex h-9 items-center gap-1.5 rounded-full border border-border px-3 text-[12px] text-foreground/75 transition-colors hover:border-foreground/30 hover:bg-muted"
                      >
                        <p.icon className="h-3.5 w-3.5" />
                        {p.label}
                      </a>
                    ))}
                  </div>
                </div>
                {/* 操作：复制链接 / 系统分享 */}
                <div className="flex gap-2 border-t border-border px-5 py-4">
                  <button
                    type="button"
                    onClick={() => void copyLink()}
                    className="flex h-11 flex-1 items-center justify-center gap-2 rounded-lg border border-border text-sm text-foreground transition-colors hover:bg-muted"
                  >
                    {copied ? <Check className="h-4 w-4" /> : <Link2 className="h-4 w-4" />}
                    {copied ? t("Copied") : t("Copy link")}
                  </button>
                  <button
                    type="button"
                    onClick={() => void share()}
                    className="flex h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-primary text-sm text-primary-foreground transition-opacity hover:opacity-90"
                  >
                    <Share2 className="h-4 w-4" />
                    {t("Share")}
                  </button>
                </div>
                {/* 微信二维码浮层 */}
                {wxOpen ? (
                  <div
                    className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-2xl bg-background/98 p-6"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <p className="text-[14px] font-medium text-foreground">{t("Scan with WeChat")}</p>
                    {wxQr ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={wxQr} alt="QR" className="h-52 w-52 rounded-lg border border-border" />
                    ) : (
                      <div className="flex h-52 w-52 items-center justify-center text-xs text-muted-foreground">…</div>
                    )}
                    <p className="max-w-[260px] text-center text-[11px] leading-relaxed text-muted-foreground">{url}</p>
                    <button
                      type="button"
                      onClick={() => setWxOpen(false)}
                      className="mt-1 rounded-full border border-border px-4 py-1.5 text-[12px] text-foreground transition-colors hover:bg-muted"
                    >
                      {t("Close")}
                    </button>
                  </div>
                ) : null}
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
