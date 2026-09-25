"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { deleteFile } from "@/lib/storage";
import { BRANDING_PREFIX, HEX_RE, LOGIN_DEFAULTS, LOGIN_FIELDS, LOGIN_IMAGE_KEYS, type LoginAppearance } from "@/lib/login-appearance";
import { LOGIN_SETTING_KEY, getLoginAppearance } from "@/lib/login-appearance-server";

export type LoginAppearanceState = { error?: string; ok?: boolean; message?: string } | undefined;

const IMAGE_RE = /^\/api\/branding\/[a-zA-Z0-9_.-]+$/;

/** Recebe o JSON do editor, valida campo a campo e salva. */
export async function saveLoginAppearance(_prev: LoginAppearanceState, form: FormData): Promise<LoginAppearanceState> {
  const user = await requireUser("superadmin");
  let input: Record<string, unknown>;
  try {
    input = JSON.parse(String(form.get("data") ?? "{}"));
  } catch {
    return { error: "Dados inválidos." };
  }

  const next = { ...LOGIN_DEFAULTS } as Record<string, unknown>;
  for (const f of LOGIN_FIELDS) {
    const v = input[f.key];
    const label = f.label;
    switch (f.kind) {
      case "boolean":
        next[f.key] = v === true;
        break;
      case "number": {
        const n = Number(v);
        if (!Number.isFinite(n) || n < (f.min ?? -Infinity) || n > (f.max ?? Infinity)) return { error: `${label}: informe um valor entre ${f.min} e ${f.max}.` };
        next[f.key] = Math.round(n);
        break;
      }
      case "color":
        if (v !== "" && !(typeof v === "string" && HEX_RE.test(v))) return { error: `${label}: cor inválida.` };
        next[f.key] = v;
        break;
      case "image":
        if (v !== "" && !(typeof v === "string" && IMAGE_RE.test(v))) return { error: `${label}: imagem inválida.` };
        next[f.key] = v;
        break;
      case "select":
        if (!f.options?.some((o) => o.value === v)) return { error: `${label}: opção inválida.` };
        next[f.key] = v;
        break;
      default: {
        const s = typeof v === "string" ? v.trim() : "";
        if (s.length > 300) return { error: `${label}: no máximo 300 caracteres.` };
        // Vazio volta ao texto padrão
        next[f.key] = s || LOGIN_DEFAULTS[f.key];
      }
    }
  }

  const old = await getLoginAppearance();
  await db.setting.upsert({
    where: { key: LOGIN_SETTING_KEY },
    create: { key: LOGIN_SETTING_KEY, value: JSON.stringify(next), updatedById: user.id },
    update: { value: JSON.stringify(next), updatedById: user.id },
  });

  // Imagens trocadas ou removidas saem do armazenamento
  for (const k of LOGIN_IMAGE_KEYS) {
    const before = old[k] as string;
    if (before && before !== next[k] && before.startsWith(BRANDING_PREFIX)) {
      await deleteFile(`/api/media/branding/${before.slice(BRANDING_PREFIX.length)}`);
    }
  }

  const changed = Object.keys(next).filter((k) => next[k] !== old[k as keyof LoginAppearance]);
  await audit(user, "settings_updated", "settings", "login_appearance", { new: { changed } });
  revalidatePath("/login");
  revalidatePath("/admin/configuracoes");
  return { ok: true, message: "Página de login atualizada." };
}
