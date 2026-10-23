"use client";

import { useFormSubmit } from "@/components/use-form-submit";
import { useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { createAnnouncement } from "@/app/actions/misc";
import { Alert, Button, Field, Input, Select, Textarea } from "@/components/ui";
import { Sheet } from "@/components/portaria/gate-actions";
import { SubmitButton } from "@/components/submit-button";

/** Botão do cabeçalho que abre o formulário numa gaveta (sobe de baixo no celular, janela no computador). */
export function NewAnnouncementButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}><Plus className="size-4" />Novo comunicado</Button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Novo comunicado">
        <p className="mb-4 text-xs text-muted">Moradores e zeladoria serão notificados.</p>
        <AnnouncementForm onDone={() => setOpen(false)} />
      </Sheet>
    </>
  );
}

export function AnnouncementForm({ onDone }: { onDone?: () => void }) {
  const [state, form, pending] = useFormSubmit(createAnnouncement);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (!state?.ok) return;
    ref.current?.reset();
    onDone?.();
  }, [state, onDone]);
  return (
    <form ref={ref} {...form} className="space-y-4">
      <Field label="Título"><Input name="title" required minLength={4} /></Field>
      <Field label="Categoria">
        <Select name="category" defaultValue="general">
          <option value="general">Geral</option>
          <option value="maintenance">Manutenção</option>
          <option value="event">Evento</option>
          <option value="rules">Regras</option>
          <option value="urgent">Urgente</option>
        </Select>
      </Field>
      <Field label="Mensagem"><Textarea name="content" rows={6} required minLength={10} /></Field>
      {state?.error && <Alert>{state.error}</Alert>}
      {state?.message && <Alert tone="ok">{state.message}</Alert>}
      <SubmitButton pending={pending} className="w-full">Publicar</SubmitButton>
    </form>
  );
}
