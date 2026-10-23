import { describe, expect, it } from "vitest";
import { canChangeQuote, canDecideQuote, parseRating, priceDiff, quoteExpired, quoteGroups, quoteKey, supplierLetter, validityLabel, whatsappNumber } from "../suppliers";

describe("fornecedores e orçamentos", () => {
  it("só síndico e superadmin decidem; o zelador não", () => {
    expect(canDecideQuote("syndic")).toBe(true);
    expect(canDecideQuote("superadmin")).toBe(true);
    expect(canDecideQuote("caretaker")).toBe(false);
  });

  it("editar/cancelar: só aguardando, por quem cadastrou ou quem decide", () => {
    const q = { status: "pending", createdById: "z1" };
    expect(canChangeQuote(q, { id: "z1", role: "caretaker" })).toBe(true);
    expect(canChangeQuote(q, { id: "z2", role: "caretaker" })).toBe(false);
    expect(canChangeQuote(q, { id: "s1", role: "syndic" })).toBe(true);
    expect(canChangeQuote({ ...q, status: "approved" }, { id: "z1", role: "caretaker" })).toBe(false);
    expect(canChangeQuote({ ...q, status: "approved" }, { id: "s1", role: "syndic" })).toBe(false);
  });

  it("validade vencida compara o dia de Brasília", () => {
    expect(quoteExpired("2026-10-22", "2026-10-23")).toBe(true);
    expect(quoteExpired("2026-10-23", "2026-10-23")).toBe(false);
    expect(quoteExpired(null, "2026-10-23")).toBe(false);
  });

  it("mesmo serviço com grafias diferentes vira um grupo, do mais barato ao mais caro", () => {
    expect(quoteKey("  Pintura da Fachada ")).toBe(quoteKey("pintura da fachada"));
    expect(quoteKey("Troca de bomba d’água")).toBe(quoteKey("troca de bomba d'agua"));
    const groups = quoteGroups([
      { id: "a", title: "Pintura da fachada", amountCents: 900000, status: "pending" },
      { id: "b", title: "pintura da fachada", amountCents: 750000, status: "pending" },
      { id: "c", title: "PINTURA DA FACHADA", amountCents: 500000, status: "cancelled" },
      { id: "d", title: "Jardim", amountCents: 30000, status: "pending" },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].quotes.map((q) => q.id)).toEqual(["b", "a"]);
    expect(groups[0].cheapestId).toBe("b");
    expect(groups[0].spread).toBe(150000);
  });

  it("grupo já todo decidido não aparece para comparar", () => {
    expect(quoteGroups([
      { id: "a", title: "Poda", amountCents: 1, status: "approved" },
      { id: "b", title: "Poda", amountCents: 2, status: "rejected" },
      { id: "c", title: "Poda", amountCents: 3, status: "approved" },
    ])).toHaveLength(0);
  });

  it("letra da agenda ignora acento; número e símbolo vão para #", () => {
    expect(supplierLetter("Élio Elétrica")).toBe("E");
    expect(supplierLetter("ágil jardins")).toBe("A");
    expect(supplierLetter("3M Serviços")).toBe("#");
  });

  it("WhatsApp: número brasileiro ganha o 55", () => {
    expect(whatsappNumber("(43) 99936-0535")).toBe("5543999360535");
    expect(whatsappNumber("43 3322-1100")).toBe("554333221100");
    expect(whatsappNumber("+55 43 99936-0535")).toBe("5543999360535");
    expect(whatsappNumber("123")).toBeNull();
    expect(whatsappNumber(null)).toBeNull();
  });

  it("nota de 1 a 5", () => {
    expect(parseRating("4")).toBe(4);
    expect(parseRating("0")).toBeNull();
    expect(parseRating("9")).toBeNull();
    expect(parseRating("")).toBeNull();
  });

  it("validade em palavras, com aviso perto de vencer", () => {
    const t = "2026-10-23";
    expect(validityLabel(null, t)).toBeNull();
    expect(validityLabel("2026-10-20", t)).toEqual({ text: "validade vencida há 3 dias", tone: "bad" });
    expect(validityLabel("2026-10-22", t)?.text).toBe("validade venceu ontem");
    expect(validityLabel("2026-10-23", t)).toEqual({ text: "vale até hoje", tone: "warn" });
    expect(validityLabel("2026-10-24", t)?.text).toBe("vale até amanhã");
    expect(validityLabel("2026-10-27", t)).toEqual({ text: "vale por mais 4 dias", tone: "warn" });
    expect(validityLabel("2026-11-30", t)).toEqual({ text: "válido até 30/11/2026", tone: "muted" });
    // Virada de mês e horário de verão não mudam a conta
    expect(validityLabel("2026-11-02", "2026-10-31")?.text).toBe("vale por mais 2 dias");
  });

  it("diferença para o menor preço", () => {
    expect(priceDiff(1000, 1000)).toBeNull();
    expect(priceDiff(1120, 1000)).toBe("+12%");
    expect(priceDiff(1005, 1000)).toBe("+0,5%");
    expect(priceDiff(900, 1000)).toBeNull();
  });
});
