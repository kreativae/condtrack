import { describe, expect, it } from "vitest";
import { NAV } from "../nav";
import { groupOf, sectionLayout } from "../menu-style";

const hrefs = (xs: { href: string }[]) => xs.map((x) => x.href);

describe("sectionLayout", () => {
  it("superadmin: início solto, plataforma no fim, auditoria e configurações no cartão, feed em Comunicação", () => {
    const { sections, userMenu } = sectionLayout(NAV.superadmin);
    expect(sections.map((s) => s.key)).toEqual(["inicio", "dia", "dinheiro", "comunicacao", "portaria", "plataforma"]);
    expect(hrefs(sections[0].items)).toEqual(["/dashboard"]);
    expect(hrefs(sections.at(-1)!.items)).toEqual(["/admin/condominios", "/admin/usuarios", "/admin/assinaturas", "/admin/interessados"]);
    expect(hrefs(userMenu)).toEqual(["/admin/auditoria", "/admin/configuracoes"]);
    expect(hrefs(sections.find((s) => s.key === "comunicacao")!.items)).toEqual(["/feed", "/comunicados", "/assembleias"]);
    expect(sections.flatMap((s) => hrefs(s.items))).toHaveLength(NAV.superadmin.length - 2);
  });
  it("síndico: administração com pessoas, estrutura e assinatura; auditoria no cartão quando tem a permissão", () => {
    const { sections, userMenu } = sectionLayout(NAV.syndic);
    expect(hrefs(sections.find((s) => s.key === "admin")!.items)).toEqual(["/usuarios", "/estrutura", "/assinatura", "/meus-condominios"]);
    expect(hrefs(userMenu)).toEqual(["/auditoria"]);
    expect(sections.some((s) => s.key === "plataforma")).toBe(false);
  });
  it("morador: nada vai para o cartão", () => {
    const { sections, userMenu } = sectionLayout(NAV.resident);
    expect(sections.flatMap((s) => hrefs(s.items))).toContain("/feed");
    expect(userMenu).toEqual([]);
  });
  it("mantém a ordem da pessoa dentro de cada seção", () => {
    const order = [...NAV.syndic].reverse();
    const dia = sectionLayout(order).sections.find((s) => s.key === "dia")!;
    expect(hrefs(dia.items)).toEqual(hrefs(NAV.syndic.filter((it) => groupOf(it.href) === "dia")).reverse());
  });
});
