"use client";

import { useFormSubmit } from "@/components/use-form-submit";
import { useEffect, useRef } from "react";
import { createAnnouncement } from "@/app/actions/misc";
import { Alert, Field, Input, Select, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

export function AnnouncementForm() {
  const [state, form, pending] = useFormSubmit(createAnnouncement);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state?.ok) ref.current?.reset(); }, [state]);
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
