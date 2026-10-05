"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { getLegalTexts } from "@/lib/legal";
import { DEFAULT_LEGAL_TEXTS, LEGAL_TEXTS_KEY, cleanMessages, cleanSections, type LegalMessages } from "@/lib/legal-texts";

export type LegalTextsState = { error?: string; ok?: boolean; message?: string } | undefined;

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Salva os textos da LGPD; guarda só o que difere do padrão (o resto acompanha atualizações do modelo). */
export async function saveLegalTexts(_prev: LegalTextsState, form: FormData): Promise<LegalTextsState> {
  const user = await requireUser("superadmin");
  let input: Record<string, unknown>;
  try {
    input = JSON.parse(String(form.get("data") ?? "{}"));
  } catch {
    return { error: "Não foi possível ler os textos. Recarregue a página e tente de novo." };
  }
  const terms = cleanSections(input.terms);
  const privacy = cleanSections(input.privacy);
  if (!terms || !privacy) return { error: "Formato inválido dos documentos." };
  if (!terms.length || !privacy.length) return { error: "Os documentos precisam de pelo menos uma seção." };
  const messages = { ...DEFAULT_LEGAL_TEXTS.messages, ...cleanMessages(input.messages) };

  const before = await getLegalTexts();
  const changedMessages = Object.fromEntries(
    Object.entries(messages).filter(([k, v]) => v !== DEFAULT_LEGAL_TEXTS.messages[k as keyof LegalMessages]),
  );
  const stored = {
    ...(!same(terms, DEFAULT_LEGAL_TEXTS.terms) && { terms }),
    ...(!same(privacy, DEFAULT_LEGAL_TEXTS.privacy) && { privacy }),
    ...(Object.keys(changedMessages).length > 0 && { messages: changedMessages }),
  };
  const value = JSON.stringify(stored);
  await db.setting.upsert({
    where: { key: LEGAL_TEXTS_KEY },
    create: { key: LEGAL_TEXTS_KEY, value, updatedById: user.id },
    update: { value, updatedById: user.id },
  });

  const changed = [
    !same(before.terms, terms) && "Termos de Uso",
    !same(before.privacy, privacy) && "Política de Privacidade",
    !same(before.messages, messages) && "mensagens",
  ].filter(Boolean) as string[];
  if (changed.length) await audit(user, "update", "setting", LEGAL_TEXTS_KEY, { new: { alterado: changed.join(", ") } });

  for (const p of ["/termos", "/privacidade", "/aceite", "/perfil", "/admin/configuracoes"]) revalidatePath(p);
  const docs = changed.some((c) => c !== "mensagens");
  return {
    ok: true,
    message: !changed.length
      ? "Nada mudou."
      : `Textos salvos (${changed.join(", ")}).${docs ? " Para pedir um novo aceite de todos, atualize a “Versão dos termos” acima." : ""}`,
  };
}
