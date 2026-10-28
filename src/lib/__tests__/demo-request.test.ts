import { describe, expect, it } from "vitest";
import { formatPhone, isRequestStatus, parseDemoRequest, profileLabel } from "../demo-request";

const ok = { name: "Marina Lopes", email: " Marina@Exemplo.com ", phone: "11988887777", condoName: "Residencial Aurora", units: "96", profile: "syndic", message: "" };

describe("formatPhone", () => {
  it("celular e fixo com DDD", () => {
    expect(formatPhone("11988887777")).toBe("(11) 98888-7777");
    expect(formatPhone("(11) 3333-4444")).toBe("(11) 3333-4444");
  });
  it("tira o 55 do Brasil", () => {
    expect(formatPhone("+55 11 98888-7777")).toBe("(11) 98888-7777");
  });
  it("recusa curto, longo ou DDD começando com 0", () => {
    for (const v of ["988887777", "123456789012345", "01988887777", ""]) expect(formatPhone(v)).toBeNull();
  });
});

describe("parseDemoRequest", () => {
  it("limpa e normaliza os dados", () => {
    const r = parseDemoRequest(ok);
    expect(r).toEqual({ data: { name: "Marina Lopes", email: "marina@exemplo.com", phone: "(11) 98888-7777", condoName: "Residencial Aurora", units: 96, profile: "syndic", message: null } });
  });
  it("unidades e mensagem são opcionais", () => {
    const r = parseDemoRequest({ ...ok, units: "", message: "  Temos 3 torres  " });
    expect("data" in r && r.data.units).toBeNull();
    expect("data" in r && r.data.message).toBe("Temos 3 torres");
  });
  it("aponta cada campo errado", () => {
    const r = parseDemoRequest({ name: "Ana", email: "ana@", phone: "123", condoName: "", units: "0", profile: "rei" });
    expect("errors" in r && Object.keys(r.errors).sort()).toEqual(["condoName", "email", "name", "phone", "profile", "units"]);
  });
  it("corta textos longos", () => {
    const r = parseDemoRequest({ ...ok, condoName: "x".repeat(500) });
    expect("data" in r && r.data.condoName.length).toBe(120);
  });
});

describe("rótulos", () => {
  it("perfil e situação", () => {
    expect(profileLabel("administrator")).toBe("Administradora");
    expect(isRequestStatus("won")).toBe(true);
    expect(isRequestStatus("x")).toBe(false);
  });
});
