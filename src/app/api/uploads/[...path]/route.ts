import { apiHandler } from "@/lib/api";
import { notFound } from "@/lib/errors";
import { effectiveStorageDriver, readLocalUpload } from "@/lib/storage";

export const runtime = "nodejs";

/** GET /api/uploads/[...path] — 本地存储静态访问 */
export const GET = apiHandler(async (req, ctx) => {
  if (effectiveStorageDriver !== "local") throw notFound();

  const parts = Array.isArray(ctx.params.path) ? ctx.params.path : [ctx.params.path];
  const restPath = parts.join("/");

  const result = await readLocalUpload(restPath);
  if (!result) throw notFound();

  return new Response(new Uint8Array(result.buffer), {
    headers: {
      "Content-Type": result.mime,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
});
