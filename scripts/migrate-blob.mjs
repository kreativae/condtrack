// Copia as mídias do Vercel Blob (pasta "os/") para o disco (UPLOAD_DIR).
// Os endereços no banco já são relativos (/api/media/<pasta>/<arquivo>), então
// nada muda no banco: com UPLOAD_DIR definido, o app passa a ler do disco.
// Pode rodar mais de uma vez: pula o que já foi copiado.
//
// No Terminal do app no Coolify (com BLOB_READ_WRITE_TOKEN e UPLOAD_DIR):
//   node scripts/migrate-blob.mjs
import { get, list } from "@vercel/blob";
import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const PREFIX = "os/";
const token =
  process.env.BLOB_READ_WRITE_TOKEN ??
  Object.entries(process.env).find(([k]) => k.endsWith("_READ_WRITE_TOKEN"))?.[1];
if (!token || !process.env.UPLOAD_DIR) {
  console.error("Defina BLOB_READ_WRITE_TOKEN e UPLOAD_DIR no app antes de rodar.");
  process.exit(1);
}
const root = path.resolve(process.env.UPLOAD_DIR);

let copied = 0, skipped = 0, failed = 0, cursor;
do {
  const page = await list({ token, prefix: PREFIX, cursor, limit: 1000 });
  for (const b of page.blobs) {
    // os/<pasta>/<arquivo> → UPLOAD_DIR/<pasta>/<arquivo> (mesmo formato do disco em src/lib/storage.ts)
    const full = path.resolve(root, b.pathname.slice(PREFIX.length));
    if (!full.startsWith(root + path.sep)) continue;
    const have = await stat(full).catch(() => null);
    if (have && have.size === b.size) { skipped++; continue; }
    const r = await get(b.pathname, { access: "private", token }).catch(() => null);
    if (!r || r.statusCode !== 200) { failed++; console.error("falhou:", b.pathname); continue; }
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, Buffer.from(await new Response(r.stream).arrayBuffer()));
    copied++;
    if (copied % 50 === 0) console.log(`  ${copied} arquivos copiados...`);
  }
  cursor = page.hasMore ? page.cursor : undefined;
} while (cursor);
console.log(`Arquivos — copiados: ${copied} · já estavam: ${skipped} · falhas: ${failed}`);
if (failed) process.exitCode = 1;
