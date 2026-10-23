import { describe, expect, it } from "vitest";
import { canChangeQuote, canDecideQuote, parseRating, quoteExpired, quoteGroups, quoteKey, supplierLetter, whatsappNumber } from "../suppliers";

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
});
