"use client";

import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { Button } from "./ui";
import type { ComponentProps } from "react";

/** `pending` explícito para formulários enviados via onSubmit (useFormSubmit). */
export function SubmitButton({ children, pendingText, pending: pendingProp, ...rest }: ComponentProps<typeof Button> & { pendingText?: string; pending?: boolean }) {
  const status = useFormStatus();
  const pending = pendingProp ?? status.pending;
  return (
    <Button type="submit" disabled={pending || rest.disabled} {...rest}>
      {pending && <Loader2 className="size-4 animate-spin" />}
      {pending && pendingText ? pendingText : children}
    </Button>
  );
}
