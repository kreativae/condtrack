"use client";

import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { deleteMessagesByFilter, deleteSelectedMessages, type MessageState } from "@/app/actions/messages";
import { useFormSubmit } from "@/components/use-form-submit";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Button, Input, Select } from "@/components/ui";

export const BULK_FORM = "historico-selecao";

/** Caixa de seleção de uma linha do Histórico (ligada ao formulário da barra pelo atributo form). */
export function RowCheck({ id, label }: { id: string; label: string }) {
  return <input type="checkbox" name="ids" value={id} form={BULK_FORM} aria-label={`Selecionar: ${label}`} className="mt-1 size-4 shrink-0 accent-[var(--brand)]" />;
}

/** Barra de exclusão em massa: marcadas nesta página ou tudo pelo filtro (tipo + idade). */
export function BulkDeleteBar({ canal, tipo, tipoLabel, total }: { canal: "app" | "email"; tipo: string | null; tipoLabel: string; total: number }) {
  const [selected, setSelected] = useState(0);
  const [onPage, setOnPage] = useState(0);
  const [askingSel, setAskingSel] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [selState, selForm, selPending] = useFormSubmit((p: MessageState, f: FormData) => deleteSelectedMessages(canal, p, f));
  const [fltState, fltForm, fltPending] = useFormSubmit((p: MessageState, f: FormData) => deleteMessagesByFilter(canal, tipo, p, f));

  const boxes = () => Array.from(document.querySelectorAll<HTMLInputElement>(`input[name="ids"][form="${BULK_FORM}"]`));
  useEffect(() => {
    const count = () => {
      const list = boxes();
      setSelected(list.filter((b) => b.checked).length);
      setOnPage(list.length);
    };
    count();
    document.addEventListener("change", count);
    return () => document.removeEventListener("change", count);
  }, [selState, fltState]);
  const all = selected > 0 && selected === onPage;
  const toggleAll = (on: boolean) => {
    const list = boxes();
    list.forEach((b) => (b.checked = on));
    setSelected(on ? list.length : 0);
  };
  const what = canal === "app" ? "notificações" : "registros de e-mail";

  return (
    <div className="space-y-3 border-b border-line px-5 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-fg-2">
          <input type="checkbox" checked={all} onChange={(e) => toggleAll(e.target.checked)} disabled={!total} className="size-4 accent-[var(--brand)]" />
          Selecionar todos desta página
        </label>
        <form {...selForm} id={BULK_FORM} className="flex items-center gap-2">
          {selected > 0 && !askingSel && (
            <Button type="button" variant="danger" size="sm" onClick={() => setAskingSel(true)}><Trash2 className="size-4" />Excluir {selected} {selected === 1 ? "selecionada" : "selecionadas"}</Button>
          )}
          {selected > 0 && askingSel && (
            <span className="flex items-center gap-2 rounded-lg bg-bad/10 px-2 py-1 text-xs">
              <span className="text-fg-2">Excluir {selected} de vez?</span>
              <SubmitButton pending={selPending} pendingText="Excluindo…" variant="danger" size="sm">Excluir</SubmitButton>
              <button type="button" onClick={() => setAskingSel(false)} className="text-fg-2">Cancelar</button>
            </span>
          )}
        </form>
        <Button type="button" variant="ghost" size="sm" className="ml-auto text-bad hover:bg-bad/10" onClick={() => setCleaning((v) => !v)} disabled={!total}>
          <Trash2 className="size-4" />Limpar histórico…
        </Button>
      </div>

      {cleaning && (
        <form {...fltForm} className="flex flex-wrap items-end gap-3 rounded-xl bg-bad/5 p-3 ring-1 ring-inset ring-bad/15">
          <p className="w-full text-xs text-fg-2">
            Exclui de vez as {what} {tipo ? <>do tipo <b className="text-fg">{tipoLabel}</b></> : <b className="text-fg">de todos os tipos</b>}
            {canal === "app" && ", também do sino de quem recebeu"}. Não dá para desfazer; fica registrado na auditoria.
          </p>
          <label className="text-xs text-muted">
            Quais
            <Select name="olderThan" defaultValue="90" className="mt-1 h-9 w-56 text-sm">
              <option value="30">Mais antigas que 30 dias</option>
              <option value="90">Mais antigas que 90 dias</option>
              <option value="180">Mais antigas que 180 dias</option>
              <option value="0">Todas ({total})</option>
            </Select>
          </label>
          <label className="text-xs text-muted">
            Digite EXCLUIR
            <Input name="confirm" autoComplete="off" required pattern="EXCLUIR" className="mt-1 h-9 w-36 text-sm" />
          </label>
          <SubmitButton pending={fltPending} pendingText="Excluindo…" variant="danger" size="sm">Excluir</SubmitButton>
          <Button type="button" variant="ghost" size="sm" onClick={() => setCleaning(false)}>Cancelar</Button>
        </form>
      )}

      {(selState?.error || fltState?.error) && <Alert>{selState?.error ?? fltState?.error}</Alert>}
      {(selState?.message || fltState?.message) && <Alert tone="ok">{fltState?.message ?? selState?.message}</Alert>}
    </div>
  );
}
