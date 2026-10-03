"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Download, KeyRound, Loader2, ShieldCheck, ShieldOff } from "lucide-react";
import { confirmTwoFactor, disableTwoFactor, regenerateRecoveryCodes, startTwoFactorSetup, type TwoFactorState } from "@/app/actions/two-factor";
import { useFormSubmit } from "@/components/use-form-submit";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Badge, Button, Field, Input } from "@/components/ui";

type Props = { enabledAt: string | null; recoveryLeft: number; disabledReason?: string };

/** Campo do código de 6 dígitos do app (ou de recuperação, quando aceito). */
function CodeInput({ recovery }: { recovery?: boolean }) {
  return recovery ? (
    <Input name="code" required autoComplete="off" autoCapitalize="off" spellCheck={false} placeholder="000000 ou xxxx-xxxx" className="font-num tracking-wider" />
  ) : (
    <Input name="code" required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7} placeholder="000000" className="font-num tracking-[0.3em]" />
  );
}

export function TwoFactorCard({ enabledAt, recoveryLeft, disabledReason }: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<"idle" | "setup" | "codes" | "regen" | "disable">("idle");
  const [setup, setSetup] = useState<{ secret: string; qr: string } | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [starting, start] = useTransition();

  // Ao terminar (ativou, gerou códigos ou desativou), mostra os códigos ou volta ao início
  const after = (s: TwoFactorState) => {
    if (s?.codes) {
      setCodes(s.codes);
      setMode("codes");
    } else if (s?.ok) {
      setMode("idle");
      router.refresh();
    }
    return s;
  };
  const [confirmState, confirmForm, confirming] = useFormSubmit(async (p: TwoFactorState, f: FormData) => after(await confirmTwoFactor(p, f)), null);
  const [regenState, regenForm, regenerating] = useFormSubmit(async (p: TwoFactorState, f: FormData) => after(await regenerateRecoveryCodes(p, f)), null);
  const [disableState, disableForm, disabling] = useFormSubmit(async (p: TwoFactorState, f: FormData) => after(await disableTwoFactor(p, f)), null);

  if (disabledReason) return <p className="text-sm text-muted">{disabledReason}</p>;

  if (mode === "codes" && codes) return <RecoveryCodes codes={codes} onDone={() => { setCodes(null); setMode("idle"); router.refresh(); }} />;

  if (mode === "setup" && setup) {
    return (
      <div className="grid gap-6 sm:grid-cols-[auto_1fr]">
        <div className="mx-auto w-44 overflow-hidden rounded-2xl ring-1 ring-line sm:mx-0" dangerouslySetInnerHTML={{ __html: setup.qr }} />
        <div className="space-y-4">
          <ol className="list-decimal space-y-1.5 pl-5 text-sm text-fg-2">
            <li>Abra o app autenticador (Google Authenticator, Microsoft Authenticator, Authy, 1Password…).</li>
            <li>Toque em adicionar e leia o QR. Sem câmera? Digite a chave abaixo.</li>
            <li>Digite o código de 6 dígitos que aparecer no app.</li>
          </ol>
          <p className="break-all rounded-xl bg-bg-2 px-3 py-2 font-num text-xs tracking-wider text-fg-2">{setup.secret.replace(/(.{4})/g, "$1 ").trim()}</p>
          <form {...confirmForm} className="space-y-3">
            <Field label="Código do app"><CodeInput /></Field>
            {confirmState?.error && <Alert>{confirmState.error}</Alert>}
            <div className="flex flex-wrap gap-2">
              <SubmitButton pending={confirming} pendingText="Conferindo…">Ativar</SubmitButton>
              <Button type="button" variant="ghost" onClick={() => setMode("idle")}>Cancelar</Button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  if (!enabledAt) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-bg-2 text-muted"><ShieldOff className="size-5" /></span>
          <p className="text-sm text-fg-2">
            Além da senha, o login pede um código do app autenticador do seu celular. Mesmo que alguém descubra a senha, não entra.
          </p>
        </div>
        <div className="shrink-0">
          <Button
            disabled={starting}
            onClick={() =>
              start(async () => {
                setStartError(null);
                const r = await startTwoFactorSetup();
                if (r.error || !r.secret || !r.qr) return setStartError(r.error ?? "Não foi possível iniciar.");
                setSetup({ secret: r.secret, qr: r.qr });
                setMode("setup");
              })
            }
          >
            {starting ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}Ativar
          </Button>
        </div>
        {startError && <Alert>{startError}</Alert>}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-ok/10 text-ok"><ShieldCheck className="size-5" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Ativada desde {new Date(enabledAt).toLocaleDateString("pt-BR")}</p>
          <p className="text-xs text-muted">
            {recoveryLeft} {recoveryLeft === 1 ? "código de recuperação restante" : "códigos de recuperação restantes"}
          </p>
        </div>
        {recoveryLeft <= 2 && <Badge tone="warn">Gere novos códigos</Badge>}
      </div>
      {mode === "idle" && (
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setMode("regen")}><KeyRound className="size-4" />Novos códigos de recuperação</Button>
          <Button variant="danger" size="sm" onClick={() => setMode("disable")}><ShieldOff className="size-4" />Desativar</Button>
        </div>
      )}
      {mode === "regen" && (
        <form {...regenForm} className="space-y-3 sm:max-w-sm">
          <Field label="Código do app" hint="Os códigos de recuperação antigos deixam de valer."><CodeInput /></Field>
          {regenState?.error && <Alert>{regenState.error}</Alert>}
          <div className="flex gap-2">
            <SubmitButton pending={regenerating} pendingText="Gerando…">Gerar</SubmitButton>
            <Button type="button" variant="ghost" onClick={() => setMode("idle")}>Cancelar</Button>
          </div>
        </form>
      )}
      {mode === "disable" && (
        <form {...disableForm} className="space-y-3 sm:max-w-sm">
          <Field label="Código do app ou de recuperação"><CodeInput recovery /></Field>
          {disableState?.error && <Alert>{disableState.error}</Alert>}
          <div className="flex gap-2">
            <SubmitButton pending={disabling} pendingText="Desativando…" variant="danger">Desativar</SubmitButton>
            <Button type="button" variant="ghost" onClick={() => setMode("idle")}>Cancelar</Button>
          </div>
        </form>
      )}
    </div>
  );
}

function RecoveryCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const [copied, setCopied] = useState(false);
  const text = `Condtrack: códigos de recuperação (cada um vale uma vez)\n\n${codes.join("\n")}\n`;
  return (
    <div className="space-y-4">
      <Alert tone="warn">
        Guarde estes códigos num lugar seguro (gerenciador de senhas, papel). Eles entram no lugar do app se você perder o celular
        e <b>não aparecem de novo</b>.
      </Alert>
      <ul className="grid grid-cols-2 gap-2 rounded-2xl bg-bg-2 p-4 font-num text-sm tracking-wider sm:grid-cols-5">
        {codes.map((c) => <li key={c}>{c}</li>)}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigator.clipboard?.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); })}
        >
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}{copied ? "Copiado" : "Copiar"}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
            const a = Object.assign(document.createElement("a"), { href: url, download: "condtrack-codigos-de-recuperacao.txt" });
            a.click();
            URL.revokeObjectURL(url);
          }}
        >
          <Download className="size-4" />Baixar .txt
        </Button>
        <Button size="sm" onClick={onDone}>Já guardei</Button>
      </div>
    </div>
  );
}
