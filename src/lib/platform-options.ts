// Opções da plataforma escolhidas pelo superadmin em Configurações → Aparência.
// Seguro para client e server.
import { ROLES, type Role } from "./roles";

export const PLATFORM_SETTING_KEY = "platform_options";

export type PlatformOptions = {
  /** Abas Vercel e Neon em Configurações (o que foi salvo nelas fica guardado mesmo desligadas) */
  vercelNeon: boolean;
  /** Perfis que veem o commit em vigor no canto inferior direito */
  buildInfoRoles: Role[];
};

export const PLATFORM_DEFAULTS: PlatformOptions = { vercelNeon: true, buildInfoRoles: ["superadmin"] };

/** Normaliza o que veio do banco ou do formulário. */
export function parsePlatformOptions(v: unknown): PlatformOptions {
  const o = (v && typeof v === "object" ? v : {}) as Partial<Record<keyof PlatformOptions, unknown>>;
  return {
    vercelNeon: typeof o.vercelNeon === "boolean" ? o.vercelNeon : PLATFORM_DEFAULTS.vercelNeon,
    buildInfoRoles: Array.isArray(o.buildInfoRoles)
      ? ROLES.filter((r) => (o.buildInfoRoles as unknown[]).includes(r))
      : PLATFORM_DEFAULTS.buildInfoRoles,
  };
}
