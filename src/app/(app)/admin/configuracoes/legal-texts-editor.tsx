"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, ExternalLink, Plus, RotateCcw, Trash2 } from "lucide-react";
import { saveLegalTexts } from "@/app/actions/legal-texts";
import { useFormSubmit } from "@/components/use-form-submit";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Button, Card, CardHeader, Field, Input, Textarea, cx } from "@/components/ui";
import { DEFAULT_LEGAL_TEXTS, LEGAL_VARS, MESSAGE_FIELDS, type LegalMessages, type LegalTexts, type Section } from "@/lib/legal-texts";

type Tab = "terms" | "privacy" | "messages";
type Draft = { id: number; title: string; text: string };

let seq = 0;
// No editor, cada parágrafo é separado por uma linha em branco
const toDrafts = (s: Section[]): Draft[] => s.map((x) => ({ id: ++seq, title: x.title, text: x.body.join("\n\n") }));
const toSections = (d: Draft[]): Section[] => d.map((x) => ({ title: x.title, body: x.text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean) }));

const TABS: { key: Tab; label: string; href?: string }[] = [
  { key: "terms", label: "Termos de Uso", href: "/termos" },
  { key: "privacy", label: "Política de Privacidade", href: "/privacidade" },
  { key: "messages", label: "Mensagens" },
];

/** Textos da LGPD: documentos públicos (seções) e mensagens do aceite e de Meu perfil. */
export function LegalTextsEditor({ initial }: { initial: LegalTexts }) {
  const [tab, setTab] = useState<Tab>("terms");
  const [terms, setTerms] = useState(() => toDrafts(initial.terms));
  const [privacy, setPrivacy] = useState(() => toDrafts(initial.privacy));
  const [messages, setMessages] = useState<LegalMessages>(initial.messages);
  const [state, form, pending] = useFormSubmit(saveLegalTexts);

  const data = JSON.stringify({ terms: toSections(terms), privacy: toSections(privacy), messages });
  const current = TABS.find((t) => t.key === tab)!;

  function restore() {
    if (!confirm(`Voltar “${current.label}” ao texto padrão? O que foi editado nesta aba se perde ao salvar.`)) return;
    if (tab === "terms") setTerms(toDrafts(DEFAULT_LEGAL_TEXTS.terms));
    else if (tab === "privacy") setPrivacy(toDrafts(DEFAULT_LEGAL_TEXTS.privacy));
    else setMessages(DEFAULT_LEGAL_TEXTS.messages);
  }

  return (
    <Card>
      <CardHeader
        title="Textos da LGPD"
        subtitle="Termos de Uso, Política de Privacidade e as mensagens do aceite e de Meu perfil. Use as variáveis abaixo para puxar os dados legais preenchidos acima."
      />
      <form {...form} className="space-y-5 p-5 sm:p-6">
        <input type="hidden" name="data" value={data} />

        <div className="flex flex-wrap gap-1.5 text-xs">
          {LEGAL_VARS.map((v) => (
            <code key={v.key} title={v.label} className="rounded-md bg-bg-2 px-2 py-1 text-fg-2">{`{${v.key}}`}</code>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b border-line">
          <nav className="flex gap-1 overflow-x-auto">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={cx("-mb-px whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition", tab === t.key ? "border-brand text-brand" : "border-transparent text-muted hover:text-fg")}
              >
                {t.label}
              </button>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-1 pb-1.5">
            {current.href && (
              <a href={current.href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-muted hover:text-brand">
                <ExternalLink className="size-3.5" />Ver página
              </a>
            )}
            <button type="button" onClick={restore} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-muted hover:text-fg">
              <RotateCcw className="size-3.5" />Restaurar padrão
            </button>
          </div>
        </div>

        {tab === "terms" && <SectionsEditor items={terms} onChange={setTerms} />}
        {tab === "privacy" && <SectionsEditor items={privacy} onChange={setPrivacy} />}
        {tab === "messages" && (
          <div className="space-y-4">
            {MESSAGE_FIELDS.map((f) => (
              <Field key={f.key} label={f.label} hint={f.hint}>
                {f.rows ? (
                  <Textarea rows={f.rows} value={messages[f.key]} onChange={(e) => setMessages({ ...messages, [f.key]: e.target.value })} />
                ) : (
                  <Input value={messages[f.key]} onChange={(e) => setMessages({ ...messages, [f.key]: e.target.value })} />
                )}
              </Field>
            ))}
          </div>
        )}

        {state?.error && <Alert>{state.error}</Alert>}
        {state?.message && <Alert tone="ok">{state.message}</Alert>}
        <div className="border-t border-line pt-5">
          <SubmitButton pending={pending} pendingText="Salvando…">Salvar textos</SubmitButton>
        </div>
      </form>
    </Card>
  );
}

function SectionsEditor({ items, onChange }: { items: Draft[]; onChange: (d: Draft[]) => void }) {
  const set = (id: number, patch: Partial<Draft>) => onChange(items.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const move = (i: number, d: -1 | 1) => {
    const next = [...items];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    onChange(next);
  };
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted">Separe os parágrafos com uma linha em branco. A numeração faz parte do título.</p>
      {items.map((s, i) => (
        <div key={s.id} className="space-y-2 rounded-2xl border border-line p-4">
          <div className="flex items-center gap-2">
            <Input value={s.title} onChange={(e) => set(s.id, { title: e.target.value })} placeholder="Título da seção" className="font-semibold" aria-label="Título da seção" />
            <Button type="button" variant="ghost" size="sm" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Subir"><ArrowUp className="size-4" /></Button>
            <Button type="button" variant="ghost" size="sm" disabled={i === items.length - 1} onClick={() => move(i, 1)} aria-label="Descer"><ArrowDown className="size-4" /></Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={items.length === 1}
              onClick={() => confirm(`Remover a seção “${s.title || "sem título"}”?`) && onChange(items.filter((x) => x.id !== s.id))}
              aria-label="Remover seção"
            >
              <Trash2 className="size-4 text-bad" />
            </Button>
          </div>
          <Textarea
            value={s.text}
            onChange={(e) => set(s.id, { text: e.target.value })}
            rows={Math.min(14, Math.max(3, Math.ceil(s.text.length / 90) + s.text.split("\n").length))}
            aria-label="Texto da seção"
          />
        </div>
      ))}
      <Button type="button" variant="outline" onClick={() => onChange([...items, { id: ++seq, title: `${items.length + 1}. `, text: "" }])}>
        <Plus className="size-4" />Adicionar seção
      </Button>
    </div>
  );
}
