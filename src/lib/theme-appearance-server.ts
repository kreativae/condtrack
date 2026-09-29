import "server-only";
import { cache } from "react";
import { db } from "./db";
import { THEME_SETTING_KEY, withThemeDefaults, type ThemeAppearance } from "./theme-appearance";

// Cores públicas (valem também na tela de login): JSON puro, sem cifra.
// cache(): o layout e o viewport leem uma vez só por requisição.
export const getThemeAppearance = cache(async (): Promise<ThemeAppearance> => {
  const row = await db.setting.findUnique({ where: { key: THEME_SETTING_KEY } }).catch(() => null);
  if (!row) return withThemeDefaults({});
  try {
    return withThemeDefaults(JSON.parse(row.value));
  } catch {
    return withThemeDefaults({});
  }
});
