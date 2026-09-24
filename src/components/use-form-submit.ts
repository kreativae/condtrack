"use client";

import { startTransition, useActionState, type FormEvent } from "react";

/**
 * Como useActionState, mas sem o reset automático do React 19: com
 * `<form action={fn}>` o React limpa os campos após cada envio — inclusive
 * quando o servidor devolve um erro de validação, apagando o que foi digitado.
 *
 * Uso: `const [state, form, pending] = useFormSubmit(acao)` e `<form {...form}>`.
 * - `onSubmit` (após a hidratação) envia manualmente, preservando os campos.
 * - `action` garante o envio por POST para a server action antes da hidratação
 *   (progressive enhancement). Sem ele, um envio antes do JS carregar viraria um
 *   GET nativo — com os campos (inclusive senhas) na URL.
 */
export function useFormSubmit<S>(action: (state: Awaited<S>, form: FormData) => S | Promise<S>, initial?: Awaited<S>) {
  const [state, dispatch, pending] = useActionState<S, FormData>(action, initial as Awaited<S>);
  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); // impede também o action nativo/React (e o reset)
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLElement | null;
    const data = new FormData(e.currentTarget, submitter);
    startTransition(() => dispatch(data));
  }
  return [state, { action: dispatch, onSubmit }, pending] as const;
}
