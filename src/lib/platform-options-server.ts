import "server-only";
import { cache } from "react";
import { db } from "./db";
import { PLATFORM_DEFAULTS, PLATFORM_SETTING_KEY, parsePlatformOptions, type PlatformOptions } from "./platform-options";

/** Opções da plataforma (público, JSON puro como o estilo do menu). */
export const getPlatformOptions = cache(async (): Promise<PlatformOptions> => {
  const row = await db.setting.findUnique({ where: { key: PLATFORM_SETTING_KEY } }).catch(() => null);
  try {
    return row ? parsePlatformOptions(JSON.parse(row.value)) : PLATFORM_DEFAULTS;
  } catch {
    return PLATFORM_DEFAULTS;
  }
});
