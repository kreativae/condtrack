"use client";

import { useState } from "react";
import { Star } from "lucide-react";
import type { SupplierState } from "@/app/actions/suppliers";
import { useFormSubmit } from "@/components/use-form-submit";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Field, Input, Textarea, cx } from "@/components/ui";
import { SUPPLIER_CATEGORIES } from "@/lib/suppliers";

export type SupplierInitial = {
  name: string; category: string; contactName: string; phone: string; email: string; document: string; address: string; notes: string; rating: number | null;
};

export function SupplierForm({ action, initial, categories }: {
  action: (s: SupplierState, f: FormData) => Promise<SupplierState>;
  initial?: SupplierInitial;
  /** Ramos já usados no condomínio (entram nas sugestões antes dos padrões) */
  categories: string[];
}) {
  const [state, form, pending] = useFormSubmit(action);
  const [rating, setRating] = useState(initial?.rating ?? 0);
  const options = [...new Set([...categories, ...SUPPLIER_CATEGORIES])];

  return (
    <form {...form} className="space-y-5">
      <input type="hidden" name="rating" value={rating || ""} />
      <div className="grid gap-4 sm:grid-cols-[1.4fr_1fr]">
        <Field label="Nome do fornecedor">
          <Input name="name" required minLength={2} maxLength={120} defaultValue={initial?.name} placeholder="Ex.: Cores & Cia Pinturas" autoFocus={!initial} />
        </Field>
        <Field label="Ramo" hint="Escolha ou escreva.">
          <Input name="category" list="supplier-categories" maxLength={60} defaultValue={initial?.category} placeholder="Ex.: Pintura" />
          <datalist id="supplier-categories">{options.map((c) => <option key={c} value={c} />)}</datalist>
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Pessoa de contato">
          <Input name="contactName" maxLength={120} defaultValue={initial?.contactName} />
        </Field>
        <Field label="Telefone / WhatsApp">
          <Input name="phone" type="tel" inputMode="tel" maxLength={40} defaultValue={initial?.phone} placeholder="(43) 99999-0000" />
        </Field>
        <Field label="E-mail">
          <Input name="email" type="email" maxLength={160} defaultValue={initial?.email} />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-[1fr_2fr]">
        <Field label="CNPJ ou CPF">
          <Input name="document" maxLength={30} inputMode="numeric" defaultValue={initial?.document} />
        </Field>
        <Field label="Endereço">
          <Input name="address" maxLength={200} defaultValue={initial?.address} />
        </Field>
      </div>

      <Field label="Avaliação" hint="Como foi o serviço (opcional). Toque de novo na mesma estrela para tirar.">
        <div className="flex items-center gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" onClick={() => setRating(rating === n ? 0 : n)} aria-label={`${n} estrela${n > 1 ? "s" : ""}`} className="rounded-lg p-1 transition hover:bg-bg-2">
              <Star className={cx("size-6", n <= rating ? "fill-warn text-warn" : "text-line-strong")} />
            </button>
          ))}
        </div>
      </Field>

      <Field label="Observações" hint="Horário de atendimento, dados bancários, o que já fez no condomínio…">
        <Textarea name="notes" rows={4} maxLength={2000} defaultValue={initial?.notes} />
      </Field>

      {state?.error && <Alert>{state.error}</Alert>}
      <div className="flex justify-end">
        <SubmitButton pending={pending} pendingText="Salvando…">{initial ? "Salvar alterações" : "Cadastrar fornecedor"}</SubmitButton>
      </div>
    </form>
  );
}
