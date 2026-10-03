"use client";

import { useState } from "react";
import { useFormSubmit } from "@/components/use-form-submit";
import { HOUSE_NOUNS, LAYOUTS, type HouseNoun, type Layout } from "@/lib/units";
import type { AdminState } from "@/app/actions/admin";
import { Alert, Field, Input, Select, Textarea, cx } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

type Condo = {
  name: string; address: string | null; cnpj: string | null; phone: string | null; email: string | null; accentColor: string;
  layout?: string; houseNoun?: string; logoUrl?: string | null; checklistDeadline?: string | null; councilFinanceAccess?: boolean; active?: boolean;
};

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
      {initial ? <EditDetails initial={initial} /> : <InitialStructure />}
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

/** Edição: tipo, nomenclatura, logo, checklist, conselho e situação (superadmin edita tudo). */
function EditDetails({ initial }: { initial: Condo }) {
  const [layout, setLayout] = useState<Layout>((initial.layout as Layout) ?? "vertical");
  const [preview, setPreview] = useState<string | null>(initial.logoUrl ?? null);
  return (
    <fieldset className="space-y-5 rounded-2xl border border-line p-5">
      <legend className="px-2 text-xs font-medium text-brand">Funcionamento</legend>
      <div className="grid gap-2 sm:grid-cols-3">
        {(Object.keys(LAYOUTS) as Layout[]).map((k) => (
          <label key={k} className={cx("cursor-pointer rounded-xl border px-4 py-3 transition", layout === k ? "border-brand bg-brand-soft" : "border-line hover:bg-bg-2")}>
            <input type="radio" name="layout" value={k} checked={layout === k} onChange={() => setLayout(k)} className="sr-only" />
            <span className={cx("block text-sm font-semibold", layout === k && "text-brand")}>{LAYOUTS[k].label}</span>
            <span className="mt-0.5 block text-xs text-muted">{LAYOUTS[k].hint}</span>
          </label>
        ))}
      </div>
      <p className="-mt-2 text-xs text-muted">Trocar o tipo não mexe nas torres e quadras já cadastradas; ajuste-as em Estrutura.</p>
      <div className="grid gap-5 sm:grid-cols-2">
        {layout !== "vertical" ? (
          <Field label="Como chamar as unidades das quadras" hint="As casas/lotes já cadastrados mudam junto.">
            <Select name="houseNoun" defaultValue={initial.houseNoun ?? "house"}>
              {(Object.keys(HOUSE_NOUNS) as HouseNoun[]).map((k) => <option key={k} value={k}>{HOUSE_NOUNS[k].one} ({HOUSE_NOUNS[k].many.toLowerCase()})</option>)}
            </Select>
          </Field>
        ) : (
          <input type="hidden" name="houseNoun" value={initial.houseNoun ?? "house"} />
        )}
        <Field label="Horário limite do checklist" hint="Depois dele, síndico e zelador são avisados se faltar item. Vazio = sem aviso.">
          <Input name="checklistDeadline" type="time" defaultValue={initial.checklistDeadline ?? ""} />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-[auto_1fr] sm:items-center">
        <div className="flex size-20 items-center justify-center overflow-hidden rounded-2xl bg-bg-2 ring-1 ring-line">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="Logo do condomínio" className="size-full object-contain" />
          ) : (
            <span className="text-xs text-muted">Sem logo</span>
          )}
        </div>
        <Field label="Logo do condomínio" hint="PNG, JPG ou WebP, até 1 MB. Aparece nos relatórios e nas atas.">
          <Input
            name="logo"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="h-auto py-2"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) setPreview(URL.createObjectURL(f));
            }}
          />
          {initial.logoUrl && (
            <label className="mt-2 flex items-center gap-2 text-xs text-fg-2">
              <input type="checkbox" name="removeLogo" className="size-4 accent-[var(--brand)]" onChange={(e) => setPreview(e.target.checked ? null : initial.logoUrl ?? null)} />
              Remover a logo atual
            </label>
          )}
        </Field>
      </div>

      <div className="space-y-3">
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="councilFinanceAccess" defaultChecked={initial.councilFinanceAccess} className="mt-0.5 size-4 accent-[var(--brand)]" />
          <span>Conselho pode ver o Financeiro <span className="block text-xs text-muted">Somente leitura. A mudança fica no histórico do Financeiro.</span></span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="active" defaultChecked={initial.active ?? true} className="mt-0.5 size-4 accent-[var(--brand)]" />
          <span>Condomínio ativo <span className="block text-xs text-muted">Inativo: o acesso continua, mas os avisos automáticos (checklist atrasado, manutenção preventiva) param.</span></span>
        </label>
      </div>
    </fieldset>
  );
}
