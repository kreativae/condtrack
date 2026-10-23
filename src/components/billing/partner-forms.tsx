"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Wand2 } from "lucide-react";
import { applyPartnerCode, cancelCommission, linkCondoPartner, linkCondoToPartner, setPartnerActive, payCommissions, saveCommissionSettings, savePartner, type PartnerState } from "@/app/actions/partners";
import { useFormSubmit } from "@/components/use-form-submit";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Button, Field, FieldGroup, Input, Select, Textarea, buttonClass, cx } from "@/components/ui";
import { PARTNER_KINDS, ruleLabel, suggestCode, type CommissionSettings, type PartnerKind } from "@/lib/commissions";

const Msg = ({ state }: { state: PartnerState }) =>
  state?.error ? <Alert>{state.error}</Alert> : state?.message ? <Alert tone="ok">{state.message}</Alert> : null;

export type PartnerInitial = {
  name: string; code: string; kind: string; document: string; email: string; phone: string; pixKey: string; notes: string;
  firstPct: string; firstMonths: string; afterPct: string;
};

/** Cadastro e edição do parceiro. A regra própria é opcional: em branco, vale a do tipo. */
export function PartnerForm({ id, initial, settings }: { id?: string; initial?: PartnerInitial; settings: CommissionSettings }) {
  const router = useRouter();
  const [state, form, pending] = useFormSubmit<PartnerState>(savePartner.bind(null, id ?? null));
  const [kind, setKind] = useState<PartnerKind>((initial?.kind as PartnerKind) ?? "seller");
  const name = useRef<HTMLInputElement>(null);
  const code = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (state?.ok && state.id && !id) router.push(`/admin/assinaturas/parceiros/${state.id}`);
  }, [state, id, router]);
  const base = settings.rules[kind];
  return (
    <form {...form} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-[1.6fr_1fr]">
        <Field label="Nome ou razão social"><Input ref={name} name="name" required minLength={2} maxLength={120} defaultValue={initial?.name} /></Field>
        <FieldGroup label="Código" hint="O síndico informa na assinatura.">
          <div className="flex gap-2">
            <Input ref={code} name="code" required defaultValue={initial?.code} placeholder="JOAO27" className="min-w-0 flex-1 font-num uppercase" maxLength={16} />
            <button type="button" onClick={() => { if (code.current) code.current.value = suggestCode(name.current?.value ?? ""); }} className="inline-flex shrink-0 items-center rounded-xl px-3 text-muted ring-1 ring-line-strong hover:bg-bg-2 hover:text-brand" title="Sugerir pelo nome" aria-label="Sugerir código pelo nome">
              <Wand2 className="size-4" />
            </button>
          </div>
        </FieldGroup>
      </div>

      <FieldGroup label="Tipo">
        <input type="hidden" name="kind" value={kind} />
        <div className="grid gap-2 sm:grid-cols-3">
          {(Object.keys(PARTNER_KINDS) as PartnerKind[]).map((k) => (
            <button key={k} type="button" onClick={() => setKind(k)} aria-pressed={kind === k} className={cx("rounded-2xl p-3 text-left ring-1 transition", kind === k ? "bg-brand-soft ring-2 ring-brand" : "bg-surface ring-line hover:ring-line-strong")}>
              <span className="block text-sm font-semibold">{PARTNER_KINDS[k].label}</span>
              <span className="block text-xs text-muted">{PARTNER_KINDS[k].hint}</span>
              <span className="mt-1 block text-xs font-medium text-brand">{ruleLabel(settings.rules[k])}</span>
            </button>
          ))}
        </div>
      </FieldGroup>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="CPF ou CNPJ"><Input name="document" maxLength={30} defaultValue={initial?.document} /></Field>
        <Field label="Chave Pix"><Input name="pixKey" maxLength={120} defaultValue={initial?.pixKey} /></Field>
        <Field label="E-mail"><Input name="email" type="email" maxLength={160} defaultValue={initial?.email} /></Field>
        <Field label="Telefone"><Input name="phone" maxLength={40} defaultValue={initial?.phone} /></Field>
      </div>

      <FieldGroup label="Regra própria (opcional)" hint={`Em branco, vale a do tipo: ${ruleLabel(base)}.`}>
        <div className="grid grid-cols-3 gap-2">
          <Input name="firstPct" inputMode="decimal" defaultValue={initial?.firstPct} placeholder={`${base.pct}%`} aria-label="Percentual no começo" />
          <Input name="firstMonths" inputMode="numeric" defaultValue={initial?.firstMonths} placeholder={base.months ? `${base.months} meses` : "sem prazo"} aria-label="Por quantos meses (0 = sem prazo)" />
          <Input name="afterPct" inputMode="decimal" defaultValue={initial?.afterPct} placeholder={`depois ${base.afterPct}%`} aria-label="Percentual depois do prazo" />
        </div>
        <p className="mt-1 text-[11px] text-muted">% no começo · por quantos meses (0 = enquanto pagar) · % depois</p>
      </FieldGroup>

      <Field label="Observações internas"><Textarea name="notes" rows={2} maxLength={2000} defaultValue={initial?.notes} /></Field>
      <Msg state={state} />
      <div className="flex justify-end"><SubmitButton pending={pending}>{id ? "Salvar" : "Cadastrar parceiro"}</SubmitButton></div>
    </form>
  );
}

/** Regras padrão por tipo, carência e desconto da base. */
export function CommissionRulesForm({ settings }: { settings: CommissionSettings }) {
  const [state, form, pending] = useFormSubmit<PartnerState>(saveCommissionSettings);
  return (
    <form {...form} className="space-y-4">
      <div>
        <table className="w-full table-fixed text-sm">
          <thead className="text-left text-xs text-muted">
            <tr><th className="w-[34%] pb-2 font-medium">Tipo</th><th className="pb-2 font-medium">% começo</th><th className="pb-2 font-medium">Meses</th><th className="pb-2 font-medium">% depois</th></tr>
          </thead>
          <tbody className="divide-y divide-line">
            {(Object.keys(PARTNER_KINDS) as PartnerKind[]).map((k) => (
              <tr key={k}>
                <td className="py-2 pr-2 font-medium">{PARTNER_KINDS[k].label}</td>
                <td className="py-2 pr-2"><Input name={`${k}.pct`} inputMode="decimal" defaultValue={settings.rules[k].pct} className="w-full" /></td>
                <td className="py-2 pr-2"><Input name={`${k}.months`} inputMode="numeric" defaultValue={settings.rules[k].months} className="w-full" /></td>
                <td className="py-2"><Input name={`${k}.afterPct`} inputMode="decimal" defaultValue={settings.rules[k].afterPct} className="w-full" /></td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-1 text-[11px] text-muted">Meses = 0: a % do começo vale enquanto o condomínio pagar.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Carência (pagamentos)" hint="A comissão só fica a pagar a partir deste pagamento do condomínio.">
          <Input name="holdPayments" inputMode="numeric" defaultValue={settings.holdPayments} />
        </Field>
        <Field label="Desconto da base (%)" hint="Impostos e taxas tirados do valor pago antes da %.">
          <Input name="deductPct" inputMode="decimal" defaultValue={settings.deductPct} />
        </Field>
      </div>
      <Msg state={state} />
      <div className="flex justify-end"><SubmitButton pending={pending} size="sm">Salvar regras</SubmitButton></div>
    </form>
  );
}

/** Vincula o condomínio a um parceiro (ou desvincula). */
export function LinkPartnerForm({ condominiumId, partners, current }: { condominiumId: string; partners: { id: string; label: string }[]; current: string | null }) {
  const [state, form, pending] = useFormSubmit<PartnerState>(linkCondoPartner.bind(null, condominiumId));
  return (
    <form {...form} className="space-y-3">
      <Field label="Parceiro">
        <Select name="partnerId" defaultValue={current ?? ""}>
          <option value="">Sem parceiro</option>
          {partners.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </Select>
      </Field>
      <Field label="Comissão sobre pagamentos desde" hint="Vazio = a partir de hoje. Use a data da venda se o cadastro veio depois.">
        <Input name="since" type="date" />
      </Field>
      <Msg state={state} />
      <SubmitButton pending={pending} variant="outline" size="sm" className="w-full">Salvar vínculo</SubmitButton>
    </form>
  );
}

/** Marca como pagas as comissões a pagar do parceiro. */
export function PayCommissionsForm({ partnerId, total }: { partnerId: string; total: string }) {
  const [open, setOpen] = useState(false);
  const [state, form, pending] = useFormSubmit<PartnerState>(payCommissions.bind(null, partnerId));
  if (!open) return <Button type="button" size="sm" variant="success" onClick={() => setOpen(true)}>Pagar {total}</Button>;
  return (
    <form {...form} className="w-full space-y-2 rounded-2xl bg-bg-2 p-3">
      <Input name="note" required minLength={3} maxLength={500} autoFocus placeholder="Comprovante do Pix (ID da transação, data)" />
      <Msg state={state} />
      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => setOpen(false)} className={buttonClass("ghost", "sm")}>Voltar</button>
        <SubmitButton pending={pending} size="sm" variant="success">Confirmar pagamento de {total}</SubmitButton>
      </div>
    </form>
  );
}

/** Cancela uma comissão em carência ou a pagar, com motivo. */
export function CancelCommissionButton({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const [state, form, pending] = useFormSubmit<PartnerState>(cancelCommission.bind(null, id));
  if (!open) return <button type="button" onClick={() => setOpen(true)} className="text-xs text-muted hover:text-bad">Cancelar</button>;
  return (
    <form {...form} className="flex flex-wrap items-center gap-2">
      <Input name="reason" required minLength={3} maxLength={300} autoFocus placeholder="Motivo (ex.: estorno)" className="h-8 w-48 text-xs" />
      <SubmitButton pending={pending} size="sm" variant="danger">Cancelar</SubmitButton>
      <button type="button" onClick={() => setOpen(false)} className="text-xs text-muted">Voltar</button>
      {state?.error && <span className="text-xs text-bad">{state.error}</span>}
    </form>
  );
}

/** Copia o código do parceiro. */
export function CopyCode({ code }: { code: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={() => { navigator.clipboard?.writeText(code).then(() => { setDone(true); setTimeout(() => setDone(false), 1500); }).catch(() => {}); }}
      className="inline-flex items-center gap-1.5 rounded-lg bg-brand-soft px-2 py-1 font-num text-sm font-semibold text-brand hover:bg-brand/15"
      title="Copiar código"
    >
      {code}{done ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
    </button>
  );
}

/** Tela Assinatura do síndico: código de quem indicou (antes de assinar). */
export function PartnerCodeForm() {
  const [state, form, pending] = useFormSubmit<PartnerState>(applyPartnerCode);
  return (
    <form {...form} className="flex flex-wrap items-start gap-2">
      <Input name="code" required placeholder="Código de parceiro (opcional)" maxLength={20} className="w-60 font-num uppercase" />
      <SubmitButton pending={pending} variant="outline">Aplicar</SubmitButton>
      {(state?.error || state?.message) && <div className="w-full"><Msg state={state} /></div>}
    </form>
  );
}

/** Ficha do parceiro: vincula um condomínio que ainda não tem parceiro. */
export function AddCondoForm({ partnerId, condos }: { partnerId: string; condos: { id: string; name: string }[] }) {
  const [state, form, pending] = useFormSubmit<PartnerState>(linkCondoToPartner.bind(null, partnerId));
  if (!condos.length) return <p className="text-xs text-muted">Todos os condomínios já têm parceiro.</p>;
  return (
    <form {...form} className="space-y-2">
      <Select name="condominiumId" required defaultValue="">
        <option value="" disabled>Vincular condomínio…</option>
        {condos.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </Select>
      <div className="flex gap-2">
        <Input name="since" type="date" className="min-w-0 flex-1" aria-label="Comissão sobre pagamentos desde" title="Comissão sobre pagamentos desde (vazio = hoje)" />
        <SubmitButton pending={pending} variant="outline">Vincular</SubmitButton>
      </div>
      <p className="text-[11px] text-muted">Data vazia = comissão sobre os pagamentos a partir de hoje.</p>
      <Msg state={state} />
    </form>
  );
}

/** Tira o condomínio do parceiro (comissões já geradas ficam). */
export function UnlinkCondoButton({ partnerId, condominiumId }: { partnerId: string; condominiumId: string }) {
  const [, form, pending] = useFormSubmit<PartnerState>(linkCondoToPartner.bind(null, partnerId));
  return (
    <form {...form} onSubmit={(e) => { if (!confirm("Desvincular este condomínio? As comissões já geradas continuam.")) return e.preventDefault(); form.onSubmit(e); }}>
      <input type="hidden" name="condominiumId" value={condominiumId} />
      <input type="hidden" name="unlink" value="1" />
      <button disabled={pending} className="text-xs text-muted hover:text-bad">Desvincular</button>
    </form>
  );
}

/** Ativa ou desativa o parceiro. */
export function PartnerActiveButton({ id, active }: { id: string; active: boolean }) {
  return (
    <form action={setPartnerActive.bind(null, id, !active)}>
      <SubmitButton variant={active ? "ghost" : "outline"} size="sm" className="w-full">{active ? "Desativar parceiro" : "Reativar parceiro"}</SubmitButton>
    </form>
  );
}
