"use client";

import * as React from "react";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/fetch-client";
import { ImageWithFallback } from "@/components/ui/image-with-fallback";
import type { AdminUploadPresignResult, AdminUploadResult } from "@/components/admin/types";

import { useT } from "@/components/admin/lang-provider";
/**
 * Multi-image upload component
 * - Prefers presigned upload: POST /api/admin/uploads/presign { filename, mime }
 *   (400/404 response means local storage mode; falls back to direct upload)
 * - Local mode: POST /api/admin/uploads (FormData file)
 * - On success, add publicUrl/url to the value list
 */
export interface ImageUploaderProps {
  value: string[];
  onChange: (urls: string[]) => void;
  /** max number of images allowed, default 10 */
  max?: number;
  className?: string;
}

export function ImageUploader({ value, onChange, max = 10, className }: ImageUploaderProps) {
  const t = useT();

  const inputRef = React.useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = React.useState(false);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const remaining = max - value.length;
    if (remaining <= 0) {
      toast.warning(`You can upload at most ${max} images`);
      return;
    }
    const list = Array.from(files).slice(0, remaining);
    setUploading(true);
    const newUrls: string[] = [];
    try {
      for (const file of list) {
        const url = await uploadOne(file);
        if (url) newUrls.push(url);
      }
      if (newUrls.length > 0) {
        onChange([...value, ...newUrls]);
        toast.success(`Successfully uploaded ${newUrls.length} images`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Image upload failed");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const uploadOne = async (file: File): Promise<string | null> => {
    // 1) try presigned upload
    try {
      const res = await apiFetch<AdminUploadPresignResult>("/api/admin/uploads/presign", {
        method: "POST",
        body: JSON.stringify({ filename: file.name, mime: file.type || "image/jpeg" }),
      });
      if (!res.url) throw new Error("Presign response missing url");
      // Presigned URLs are sensitive to extra headers — use raw fetch
      const putRes = await fetch(res.url, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!putRes.ok) throw new Error("Failed to upload file to storage");
      return res.publicUrl?.startsWith("http") ? res.publicUrl : res.url;
    } catch (err) {
      const status =
        err instanceof Error && "status" in err ? (err as { status?: number }).status : undefined;
      // 400/404 (local mode) → fall back to direct upload; other errors are thrown
      if (status !== 400 && status !== 404) throw err;
    }
    // 2) Local storage: direct FormData upload
    const form = new FormData();
    form.append("file", file);
    const res = await apiFetch<AdminUploadResult>("/api/admin/uploads", {
      method: "POST",
      body: form,
    });
    const url = res.url ?? res.publicUrl;
    if (!url) throw new Error("Upload API returned no image URL");
    return url;
  };

  const removeAt = (index: number) => {
    onChange(value.filter((_, i) => i !== index));
  };

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex flex-wrap gap-3">
        {value.map((url, index) => (
          <div key={`${url}-${index}`} className="group relative">
            <ImageWithFallback
              src={url}
              alt={`Image ${index + 1}`}
              width={80}
              height={80}
              className="h-20 w-20 rounded-md border object-cover"
            />
            <button
              type="button"
              aria-label={t("Delete image")}
              onClick={() => removeAt(index)}
              className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-destructive text-white opacity-0 shadow transition-opacity group-hover:opacity-100"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        {value.length < max ? (
          <button
            type="button"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
            className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-md border border-dashed text-muted-foreground transition-colors hover:border-primary hover:text-primary disabled:opacity-50"
          >
            {uploading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <ImagePlus className="h-5 w-5" />
            )}
            <span className="text-xs">Upload images</span>
          </button>
        ) : null}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      {uploading ? (
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" /> Uploading, please wait…
        </p>
      ) : null}
      {value.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          Uploaded {value.length} / {max} images，click the thumbnail corner to delete
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          Supports jpg / png / webp / gif / avif, max {max} images
        </p>
      )}
    </div>
  );
}
