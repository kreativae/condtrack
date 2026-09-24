import "server-only";
import { mkdir, writeFile, readFile, stat, rm } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

// Armazenamento local para desenvolvimento. Em produção, substitua por
// Cloudflare R2 / Vercel Blob mantendo a mesma interface (save/read).
const ROOT = path.resolve(/*turbopackIgnore: true*/ process.env.UPLOAD_DIR ?? "./storage");

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

export async function saveFile(file: File, folder: string) {
  const ext = EXT[file.type];
  if (!ext || !ALLOWED_MIME.includes(file.type)) throw new Error(`Tipo de arquivo não suportado: ${file.type}`);
  const safeFolder = folder.replace(/[^a-zA-Z0-9_-]/g, "");
  const name = `${randomUUID()}.${ext}`;
  const dir = path.join(/*turbopackIgnore: true*/ ROOT, safeFolder);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(/*turbopackIgnore: true*/ dir, name), Buffer.from(await file.arrayBuffer()));
  return `/api/media/${safeFolder}/${name}`;
}

export async function readStored(parts: string[]) {
  const full = path.resolve(/*turbopackIgnore: true*/ ROOT, ...parts);
  if (!full.startsWith(ROOT + path.sep)) return null;
  try {
    const s = await stat(full);
    if (!s.isFile()) return null;
    const ext = path.extname(full).slice(1);
    const mime = Object.entries(EXT).find(([, e]) => e === ext)?.[0] ?? "application/octet-stream";
    return { data: await readFile(full), mime, size: s.size };
  } catch {
    return null;
  }
}

/** Remove todos os arquivos de uma pasta (ex.: mídias de uma OS excluída). */
export async function deleteFolder(folder: string) {
  const safe = folder.replace(/[^a-zA-Z0-9_-]/g, "");
  if (!safe) return;
  await rm(path.join(/*turbopackIgnore: true*/ ROOT, safe), { recursive: true, force: true });
}
