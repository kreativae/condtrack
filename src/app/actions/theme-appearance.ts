"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { HEX_RE, THEME_KEYS, THEME_SETTING_KEY, emptyTheme } from "@/lib/theme-appearance";
import { getThemeAppearance } from "@/lib/theme-appearance-server";

export type ThemeAppearanceState = { error?: string; ok?: boolean; message?: string } | undefined;

/** Recebe o JSON do editor, valida cada cor e salva. */
export async function saveThemeAppearance(_prev: ThemeAppearanceState, form: FormData): Promise<ThemeAppearanceState> {
  const user = await requireUser("superadmin");
  let input: Record<string, Record<string, unknown>>;
  try {
    input = JSON.parse(String(form.get("data") ?? "{}"));
  } catch {
    return { error: "Dados inválidos." };
  }

  const next = emptyTheme();
  for (const mode of ["light", "dark"] as const) {
    for (const k of THEME_KEYS) {
      const v = input?.[mode]?.[k] ?? "";
      if (v !== "" && !(typeof v === "string" && HEX_RE.test(v))) return { error: `Cor inválida (${mode === "light" ? "claro" : "escuro"}): ${String(v)}` };
      next[mode][k] = (v as string).toLowerCase();
    }
  }
  next.logoFollowsBrand = (input as Record<string, unknown>)?.logoFollowsBrand === true;

  const old = await getThemeAppearance();
  await db.setting.upsert({
    where: { key: THEME_SETTING_KEY },
    create: { key: THEME_SETTING_KEY, value: JSON.stringify(next), updatedById: user.id },
    update: { value: JSON.stringify(next), updatedById: user.id },
  });

  const changed = (["light", "dark"] as const).flatMap((m) => THEME_KEYS.filter((k) => next[m][k] !== old[m][k]).map((k) => `${m}.${k}`));
  if (next.logoFollowsBrand !== old.logoFollowsBrand) changed.push("logoFollowsBrand");
  await audit(user, "settings_updated", "settings", THEME_SETTING_KEY, { new: { changed } });
  // As cores vão no layout raiz: vale para todas as páginas
  revalidatePath("/", "layout");
  return { ok: true, message: "Cores atualizadas em todas as páginas." };
}
