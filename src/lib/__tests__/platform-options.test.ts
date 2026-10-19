import { describe, expect, it } from "vitest";
import { PLATFORM_DEFAULTS, parsePlatformOptions } from "../platform-options";

describe("opções da plataforma", () => {
  it("sem nada salvo: abas Vercel/Neon visíveis e commit só para o superadmin", () => {
    expect(parsePlatformOptions(undefined)).toEqual(PLATFORM_DEFAULTS);
    expect(parsePlatformOptions({})).toEqual({ vercelNeon: true, buildInfoRoles: ["superadmin"] });
  });

  it("guarda o que foi escolhido", () => {
    expect(parsePlatformOptions({ vercelNeon: false, buildInfoRoles: ["syndic", "superadmin"] })).toEqual({
      vercelNeon: false,
      buildInfoRoles: ["superadmin", "syndic"],
    });
  });

  it("lista vazia = ninguém vê o commit", () => {
    expect(parsePlatformOptions({ buildInfoRoles: [] }).buildInfoRoles).toEqual([]);
  });

  it("ignora perfis inexistentes e valores de tipo errado", () => {
    expect(parsePlatformOptions({ vercelNeon: "não", buildInfoRoles: ["root", "resident", 7] })).toEqual({
      vercelNeon: true,
      buildInfoRoles: ["resident"],
    });
  });
});
