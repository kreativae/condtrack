import { describe, expect, it } from "vitest";
import { canChangeQuote, canDecideQuote, groupLabel, groupSavings, groupStats, parseRating, priceDiff, quoteExpired, quoteKey, supplierLetter, validityLabel, whatsappNumber } from "../suppliers";

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

  it("mesmo serviço com grafias diferentes tem a mesma chave", () => {
    expect(quoteKey("  Pintura da Fachada ")).toBe(quoteKey("pintura da fachada"));
    expect(quoteKey("Troca de bomba d’água")).toBe(quoteKey("troca de bomba d'agua"));
    expect(quoteKey("Pintura da área externa")).not.toBe(quoteKey("Pintura da área interna"));
  });

  it("cotação: compara só os que aguardam ou foram aprovados", () => {
    const st = groupStats([
      { id: "a", amountCents: 900000, status: "pending" },
      { id: "b", amountCents: 750000, status: "pending" },
      { id: "c", amountCents: 500000, status: "cancelled" },
      { id: "d", amountCents: 400000, status: "rejected" },
    ]);
    expect(st.live.map((q) => q.id)).toEqual(["b", "a"]);
    expect(st.cheapestId).toBe("b");
    expect(st.spread).toBe(150000);
    expect(st.pending).toBe(2);
    expect(groupStats([{ id: "a", amountCents: 1, status: "pending" }, { id: "b", amountCents: 1, status: "pending" }]).cheapestId).toBeNull();
    expect(groupStats([]).spread).toBe(0);
  });

  it("economia do contratado em relação ao mais caro e à média (sem cancelados)", () => {
    const qs = [
      { id: "a", amountCents: 1000, status: "approved" },
      { id: "b", amountCents: 1500, status: "rejected" },
      { id: "c", amountCents: 2000, status: "rejected" },
      { id: "d", amountCents: 9000, status: "cancelled" },
    ];
    expect(groupSavings(qs[0], qs)).toEqual({ vsMax: 1000, vsAvg: 500, received: 3 });
    expect(groupSavings(null, qs)).toBeNull();
    expect(groupSavings(qs[0], [qs[0]])).toBeNull();
  });

  it("situação da cotação em palavras", () => {
    expect(groupLabel({ status: "open", archivedAt: null, chosenQuoteId: null }, 2)).toEqual({ text: "2 aguardando decisão", tone: "warn" });
    expect(groupLabel({ status: "open", archivedAt: null, chosenQuoteId: null }, 0).text).toBe("Recebendo orçamentos");
    expect(groupLabel({ status: "closed", archivedAt: null, chosenQuoteId: "q" }, 0).text).toBe("Encerrada · contratado");
    expect(groupLabel({ status: "closed", archivedAt: new Date(), chosenQuoteId: null }, 0).text).toBe("Encerrada sem contratação · arquivada");
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
