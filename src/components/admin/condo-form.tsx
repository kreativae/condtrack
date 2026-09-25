"use client";

import { useState } from "react";
import { useFormSubmit } from "@/components/use-form-submit";
import { HOUSE_NOUNS, LAYOUTS, type HouseNoun, type Layout } from "@/lib/units";
import type { AdminState } from "@/app/actions/admin";
import { Alert, Field, Input, Select, Textarea, cx } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

type Condo = { name: string; address: string | null; cnpj: string | null; phone: string | null; email: string | null; accentColor: string };

export function CondoForm({ action, initial }: { action: (s: AdminState, f: FormData) => Promise<AdminState>; initial?: Condo }) {
  const [state, form, pending] = useFormSubmit(action);
  return (
    <form {...form} className="space-y-5">
      <Field label="Nome do condomínio"><Input name="name" required defaultValue={initial?.name} /></Field>
      <Field label="Endereço"><Input name="address" defaultValue={initial?.address ?? ""} /></Field>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="CNPJ"><Input name="cnpj" defaultValue={initial?.cnpj ?? ""} /></Field>
        <Field label="Telefone"><Input name="phone" defaultValue={initial?.phone ?? ""} /></Field>
        <Field label="E-mail da administração"><Input name="email" type="email" defaultValue={initial?.email ?? ""} /></Field>
        <Field label="Cor de destaque" hint="Identidade visual do condomínio.">
          <Input name="accentColor" type="color" defaultValue={initial?.accentColor ?? "#5B5BD6"} className="h-10 p-1" />
        </Field>
      </div>
      {!initial && <InitialStructure />}
      {state?.error && <Alert>{state.error}</Alert>}
      {state?.message && <Alert tone="ok">{state.message}</Alert>}
      <SubmitButton pending={pending}>{initial ? "Salvar alterações" : "Criar condomínio"}</SubmitButton>
    </form>
  );
}

/** Estrutura inicial do novo condomínio, conforme o tipo (prédios, casas/lotes ou misto). */
function InitialStructure() {
  const [layout, setLayout] = useState<Layout>("vertical");
  const [noun, setNoun] = useState<HouseNoun>("house");
  const house = HOUSE_NOUNS[noun];
  return (
    <fieldset className="space-y-5 rounded-2xl border border-line p-5">
      <legend className="px-2 text-xs font-medium text-brand">Estrutura inicial</legend>
      <div className="grid gap-2 sm:grid-cols-3">
        {(Object.keys(LAYOUTS) as Layout[]).map((k) => (
          <label key={k} className={cx("cursor-pointer rounded-xl border px-4 py-3 transition", layout === k ? "border-brand bg-brand-soft" : "border-line hover:bg-bg-2")}>
            <input type="radio" name="layout" value={k} checked={layout === k} onChange={() => setLayout(k)} className="sr-only" />
            <span className={cx("block text-sm font-semibold", layout === k && "text-brand")}>{LAYOUTS[k].label}</span>
            <span className="mt-0.5 block text-xs text-muted">{LAYOUTS[k].hint}</span>
          </label>
        ))}
      </div>
      {layout !== "vertical" && (
        <Field label="Como chamar as unidades das quadras" className="sm:max-w-xs">
          <Select name="houseNoun" value={noun} onChange={(e) => setNoun(e.target.value as HouseNoun)}>
            {(Object.keys(HOUSE_NOUNS) as HouseNoun[]).map((k) => <option key={k} value={k}>{HOUSE_NOUNS[k].one} ({HOUSE_NOUNS[k].many.toLowerCase()})</option>)}
          </Select>
        </Field>
      )}
      {layout === "horizontal" ? (
        <>
          <Field label="Quadras / ruas" hint={`Uma por linha. Vazio = condomínio sem quadras (aparece só “${house.one} 12”).`}>
            <Textarea name="buildings" rows={3} placeholder={"Quadra A\nQuadra B"} />
          </Field>
          <Field label={`${house.many} por quadra`} hint="Numeradas de 1 em diante. Dá para ajustar depois em Estrutura." className="sm:max-w-xs">
            <Input name="houses" type="number" min={0} max={2000} defaultValue={20} />
          </Field>
        </>
      ) : (
        <>
          <Field label="Torres / blocos" hint={layout === "mixed" ? "Um por linha. As quadras você adiciona depois, em Estrutura." : "Um por linha. Vazio = Bloco Único."}>
            <Textarea name="buildings" rows={3} placeholder={"Torre A\nTorre B"} />
          </Field>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Andares por torre"><Input name="floors" type="number" min={0} max={80} defaultValue={10} /></Field>
            <Field label="Unidades por andar"><Input name="perFloor" type="number" min={0} max={20} defaultValue={4} /></Field>
          </div>
        </>
      )}
      <p className="text-xs text-muted">Categorias de serviço e áreas comuns padrão serão criadas automaticamente.</p>
    </fieldset>
  );
}
