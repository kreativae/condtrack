import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { db } from "./db";
import { groupDef, type SettingsGroup } from "./settings-schema";

// Valores cifrados com AES-256-GCM. Chave: SETTINGS_ENCRYPTION_KEY (recomendado)
// ou derivada do AUTH_SECRET. Trocar a chave invalida as configurações salvas.
function key() {
  const base = process.env.SETTINGS_ENCRYPTION_KEY ?? process.env.AUTH_SECRET;
  if (!base) throw new Error("SETTINGS_ENCRYPTION_KEY/AUTH_SECRET não configurado");
  return createHash("sha256").update(`condtrack-settings:${base}`).digest();
}

function encrypt(plain: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), data.toString("base64")].join(".");
}

function decrypt(payload: string) {
  const [, iv, tag, data] = payload.split(".");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
}

export type SettingsValues = Record<string, string | number | boolean | undefined>;

const cache = new Map<SettingsGroup, { at: number; values: SettingsValues }>();
const TTL = 30_000;

/** Valores salvos (sem defaults/env). */
async function stored(group: SettingsGroup): Promise<SettingsValues> {
  const row = await db.setting.findUnique({ where: { key: group } });
  if (!row) return {};
  try {
    return JSON.parse(decrypt(row.value));
  } catch {
    console.error(`[settings] não foi possível decifrar "${group}" (chave mudou?)`);
    return {};
  }
}

/** Valores efetivos: salvo → variável de ambiente → padrão. */
export async function getSettings(group: SettingsGroup): Promise<SettingsValues> {
  const hit = cache.get(group);
  if (hit && Date.now() - hit.at < TTL) return hit.values;
  const saved = await stored(group);
  const values: SettingsValues = {};
  for (const f of groupDef(group).fields) {
    const v = saved[f.key];
    values[f.key] = v !== undefined && v !== "" ? v : f.env && process.env[f.env] ? process.env[f.env] : f.default;
  }
  cache.set(group, { at: Date.now(), values });
  return values;
}

/** De onde vem cada valor (para a tela de configurações). */
export async function settingsSource(group: SettingsGroup) {
  const saved = await stored(group);
  return Object.fromEntries(
    groupDef(group).fields.map((f) => [
      f.key,
      saved[f.key] !== undefined && saved[f.key] !== "" ? "saved" : f.env && process.env[f.env] ? "env" : "default",
    ]),
  ) as Record<string, "saved" | "env" | "default">;
}

export async function saveSettings(group: SettingsGroup, patch: SettingsValues, userId: string) {
  const current = await stored(group);
  const next = { ...current, ...patch };
  for (const k of Object.keys(next)) if (next[k] === undefined) delete next[k];
  await db.setting.upsert({
    where: { key: group },
    create: { key: group, value: encrypt(JSON.stringify(next)), updatedById: userId },
    update: { value: encrypt(JSON.stringify(next)), updatedById: userId },
  });
  cache.delete(group);
}

export function maskSecret(v: unknown) {
  const s = String(v ?? "");
  if (!s) return "";
  return s.length <= 12 ? "••••••" : `${s.slice(0, 8)}••••••${s.slice(-4)}`;
}
