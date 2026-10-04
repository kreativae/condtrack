import "server-only";
import { cache } from "react";
import { db } from "./db";
import { MENU_SETTING_KEY, isMenuStyle, type MenuStyle } from "./menu-style";

/** Estilo do menu lateral (público, JSON puro como as cores da Aparência). */
export const getMenuStyle = cache(async (): Promise<MenuStyle> => {
  const row = await db.setting.findUnique({ where: { key: MENU_SETTING_KEY } }).catch(() => null);
  try {
    const v = row ? (JSON.parse(row.value) as { style?: unknown }).style : null;
    return isMenuStyle(v) ? v : "classic";
  } catch {
    return "classic";
  }
});
