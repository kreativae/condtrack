import "server-only";
import { mkdir, writeFile, readFile, stat, rm, unlink } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { del, get, list, put } from "@vercel/blob";

// Armazenamento de mídias das OS.
// - Vercel Blob (privado) quando BLOB_READ_WRITE_TOKEN existe — produção.
// - Disco local (./storage) caso contrário — desenvolvimento.
// Em ambos, a URL gravada no banco é /api/media/<pasta>/<arquivo>: a entrega
// passa sempre pela rota que confere a permissão de quem está vendo.
const ROOT = path.resolve(/*turbopackIgnore: true*/ process.env.UPLOAD_DIR ?? "./storage");
const BLOB_PREFIX = "os";

const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
  // apenas para arquivos gerados pelo seed; uploads não aceitam SVG
  "image/svg+xml": "svg",
};

export const ALLOWED_MIME = Object.keys(EXT).filter((m) => m !== "image/svg+xml");
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 80 * 1024 * 1024;

export function blobEnabled() {
  return !!process.env.BLOB_READ_WRITE_TOKEN;
}

const safe = (s: string) => s.replace(/[^a-zA-Z0-9_.-]/g, "");
const mimeOf = (name: string) => Object.entries(EXT).find(([, e]) => e === path.extname(name).slice(1))?.[0] ?? "application/octet-stream";

export async function saveFile(file: File, folder: string) {
  const ext = EXT[file.type];
  if (!ext || !ALLOWED_MIME.includes(file.type)) throw new Error(`Tipo de arquivo não suportado: ${file.type}`);
  const dir = safe(folder);
  const name = `${randomUUID()}.${ext}`;
  if (blobEnabled()) {
    await put(`${BLOB_PREFIX}/${dir}/${name}`, file, { access: "private", contentType: file.type, addRandomSuffix: false });
  } else {
    await mkdir(path.join(/*turbopackIgnore: true*/ ROOT, dir), { recursive: true });
    await writeFile(path.join(/*turbopackIgnore: true*/ ROOT, dir, name), Buffer.from(await file.arrayBuffer()));
  }
  return `/api/media/${dir}/${name}`;
}

export type StoredFile = { body: ReadableStream<Uint8Array> | Uint8Array; mime: string; size: number };

export async function readStored(parts: string[]): Promise<StoredFile | null> {
  if (parts.length !== 2) return null;
  const [dir, name] = parts.map(safe);
  if (!dir || !name || name.startsWith(".")) return null;

  if (blobEnabled()) {
    const res = await get(`${BLOB_PREFIX}/${dir}/${name}`, { access: "private" }).catch(() => null);
    if (!res || res.statusCode !== 200) return null;
    return { body: res.stream, mime: res.blob.contentType || mimeOf(name), size: res.blob.size };
  }

  const full = path.resolve(/*turbopackIgnore: true*/ ROOT, dir, name);
  if (!full.startsWith(ROOT + path.sep)) return null;
  try {
    const s = await stat(full);
    if (!s.isFile()) return null;
    return { body: new Uint8Array(await readFile(full)), mime: mimeOf(name), size: s.size };
  } catch {
    return null;
  }
}

/** Remove um arquivo a partir da URL /api/media/<pasta>/<arquivo>. */
export async function deleteFile(url: string) {
  const [dir, name] = url.replace(/^\/api\/media\//, "").split("/").map(safe);
  if (!dir || !name) return;
  if (blobEnabled()) await del(`${BLOB_PREFIX}/${dir}/${name}`).catch(() => null);
  else await unlink(path.join(/*turbopackIgnore: true*/ ROOT, dir, name)).catch(() => null);
}

/** Remove todos os arquivos de uma pasta (ex.: mídias de uma OS excluída). */
export async function deleteFolder(folder: string) {
  const dir = safe(folder);
  if (!dir) return;
  if (!blobEnabled()) {
    await rm(path.join(/*turbopackIgnore: true*/ ROOT, dir), { recursive: true, force: true });
    return;
  }
  let cursor: string | undefined;
  do {
    const page = await list({ prefix: `${BLOB_PREFIX}/${dir}/`, cursor, limit: 1000 });
    if (page.blobs.length) await del(page.blobs.map((b) => b.url));
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
}
