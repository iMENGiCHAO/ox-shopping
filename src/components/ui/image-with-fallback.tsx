"use client";

import { useState, type SyntheticEvent } from "react";
import Image, { type ImageProps } from "next/image";

/** 内置灰色占位图(SVG data URI)：灰色方块 + 图片图标 + "暂无图片" 文字 */
const FALLBACK_SVG = `<svg xmlns='http://www.w3.org/2000/svg' width='400' height='400' viewBox='0 0 400 400'><rect width='400' height='400' fill='#e2e8f0'/><g fill='none' stroke='#94a3b8' stroke-width='14' stroke-linecap='round' stroke-linejoin='round'><rect x='130' y='115' width='140' height='105' rx='10'/><circle cx='163' cy='150' r='11'/><path d='M130 205l38-32 26 22 30-26 46 36'/></g><text x='200' y='272' font-family='-apple-system, PingFang SC, sans-serif' font-size='26' fill='#64748b' text-anchor='middle'>No image</text></svg>`;

const FALLBACK_DATA_URI = `data:image/svg+xml,${encodeURIComponent(FALLBACK_SVG)}`;

/** 4×3 中性灰微缩图 — 本地图片的通用 blur 占位基底 */
const BLUR_TINY =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAADCAYAAAC09K7GAAAAFElEQVR4nGP8//8/AzGAiShVowoJAgCCpgQDXDeUDQAAAABJRU5ErkJggg==";

export interface ImageWithFallbackProps extends Omit<ImageProps, "src" | "onError"> {
  /** 图片地址；缺失或加载失败时自动切换为内置灰色占位图 */
  src?: ImageProps["src"];
  /** 自定义错误回调(在切换占位图之前触发) */
  onError?: ImageProps["onError"];
}

/**
 * ImageWithFallback 图片组件(客户端组件，包装 next/image)
 * - fill 模式由父容器决定(父容器需 relative + 固定尺寸)
 * - 图片加载失败(onError)时自动切换到内置 data-URI 灰色占位图
 * - props 与 next/image 兼容(src/alt/fill/sizes/priority/className 等)
 */
export function ImageWithFallback({ src, alt, onError, ...props }: ImageWithFallbackProps) {
  const [failed, setFailed] = useState(false);
  // src 缺失或加载失败 → 使用内置占位图
  const resolvedSrc = failed || !src ? FALLBACK_DATA_URI : src;

  /* 本地静态图自动加 blur 占位(Grok 规格书 P1：懒加载 + blur placeholder)；
     data:/svg: 源不支持 blur，跳过 */
  const blurProps =
    !props.placeholder && typeof resolvedSrc === "string" && resolvedSrc.startsWith("/")
      ? { placeholder: "blur" as const, blurDataURL: BLUR_TINY }
      : {};

  return (
    <Image
      src={resolvedSrc}
      alt={alt}
      onError={(e: SyntheticEvent<HTMLImageElement, Event>) => {
        onError?.(e);
        setFailed(true);
      }}
      {...blurProps}
      {...props}
    />
  );
}
