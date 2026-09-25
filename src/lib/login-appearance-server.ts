import "server-only";
import { db } from "./db";
import { withLoginDefaults, type LoginAppearance } from "./login-appearance";

// Conteúdo público (aparece na tela de login): guardado em JSON puro, sem cifra.
export const LOGIN_SETTING_KEY = "login_appearance";

export async function getLoginAppearance(): Promise<LoginAppearance> {
  const row = await db.setting.findUnique({ where: { key: LOGIN_SETTING_KEY } }).catch(() => null);
  if (!row) return withLoginDefaults({});
  try {
    return withLoginDefaults(JSON.parse(row.value));
  } catch {
    return withLoginDefaults({});
  }
}
