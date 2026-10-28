import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight, BarChart3, Building2, CalendarDays, Check, ClipboardCheck, Clock3, FileCheck2, Home, ListChecks, MessageSquareText,
  Package, Plus, Rows3, ShieldCheck, Store, Vote, Wrench, type LucideIcon,
} from "lucide-react";
import { Logo, LogoMark, MarkShapes } from "@/components/logo";
import { cx } from "@/components/ui";
import type { LandingPlan } from "@/lib/landing";
import { DemoForm } from "./demo-form";

// Página inicial para quem não entrou (src/app/page.tsx). Textos e exemplos fictícios do condomínio "Residencial Aurora";
// cores só do tema (tons por assunto com `bg-<tom>/12 text-<tom>`), faixas escuras em `.lp-ink` (globals.css).

type Tone = "brand" | "ok" | "warn" | "bad" | "info" | "teal" | "violet" | "muted";
const TONE: Record<Tone, { soft: string; text: string; dot: string }> = {
  brand: { soft: "bg-brand/12", text: "text-brand", dot: "bg-brand" },
  ok: { soft: "bg-ok/12", text: "text-ok", dot: "bg-ok" },
  warn: { soft: "bg-warn/12", text: "text-warn", dot: "bg-warn" },
  bad: { soft: "bg-bad/12", text: "text-bad", dot: "bg-bad" },
  info: { soft: "bg-info/12", text: "text-info", dot: "bg-info" },
  teal: { soft: "bg-[color-mix(in_srgb,var(--chart-2)_12%,transparent)]", text: "text-[var(--chart-2)]", dot: "bg-[var(--chart-2)]" },
  violet: { soft: "bg-[color-mix(in_srgb,var(--lp-violet)_12%,transparent)]", text: "text-[var(--lp-violet)]", dot: "bg-[var(--lp-violet)]" },
  muted: { soft: "bg-bg-2", text: "text-muted", dot: "bg-muted" },
};

const WRAP = "mx-auto w-full max-w-[1200px] px-4 sm:px-8";
const H2 = "font-display text-[34px] font-bold leading-[1.06] tracking-[-0.04em] sm:text-[48px] lg:text-[52px]";
const EYEBROW = "text-[13px] font-bold uppercase tracking-[0.15em]";
const SERVICE = (name: string) => `/demo/servicos/${name}.jpg`;

export type LandingProps = { plans: LandingPlan[]; trialDays: number; legal: { companyName: string | null; cnpj: string | null }; turnstileSiteKey: string | null };

export function Landing({ plans, trialDays, legal, turnstileSiteKey }: LandingProps) {
  return (
    <div className="lp flex min-h-dvh flex-col bg-bg text-fg">
      <SiteHeader />
      <Hero trialDays={trialDays} />
      <Demands />
      <Proof />
      <Access />
      <Features />
      {plans.length > 0 && <Plans plans={plans} trialDays={trialDays} />}
      <Faq trialDays={trialDays} />
      <FinalCall turnstileSiteKey={turnstileSiteKey} />
      <Footer legal={legal} />
    </div>
  );
}

/* ─────────── Abertura ─────────── */

/** Barra do site, presa no alto ao rolar (vidro escuro sobre as seções claras e escuras). */
function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-[color-mix(in_srgb,var(--lp-ink)_85%,transparent)] text-white backdrop-blur-md">
      <div className={cx(WRAP, "flex h-16 items-center gap-8 sm:h-[72px]")}>
        <Link href="/" aria-label="condtrack, início"><Logo invert tagline={false} /></Link>
        <nav className="hidden flex-1 gap-7 text-sm font-semibold text-white/70 md:flex">
          {[["#demandas", "Demandas"], ["#acessos", "Acessos"], ["#recursos", "Recursos"], ["#planos", "Planos"]].map(([href, label]) => (
            <a key={href} href={href} className="transition hover:text-white">{label}</a>
          ))}
        </nav>
        <span className="flex-1 md:hidden" />
        <Link href="/login" className="text-sm font-semibold text-white/90 transition hover:text-white">Entrar</Link>
        <a href="#demonstracao" className="hidden h-10 items-center rounded-full bg-white px-5 text-sm font-bold text-[var(--lp-ink)] transition hover:bg-white/90 sm:flex">Agendar demonstração</a>
      </div>
    </header>
  );
}

function Hero({ trialDays }: { trialDays: number }) {
  // Sobe por baixo da barra presa (h-16 / 72px): no alto da página, a barra fica sobre o mesmo fundo escuro
  return (
    <section className="lp-ink relative -mt-16 overflow-hidden pb-16 pt-16 sm:-mt-[72px] sm:pb-20 sm:pt-[72px]">
      <div aria-hidden className="lp-glow absolute inset-0" />
      <div aria-hidden className="lp-grid absolute inset-0" />

      <div className={cx(WRAP, "relative flex flex-col items-center gap-6 pt-10 text-center sm:pt-14")}>
        <span className="inline-flex h-[34px] items-center gap-2.5 rounded-full border border-white/12 bg-white/[0.07] pl-1.5 pr-3.5 text-[13px] font-semibold text-white/85">
          <span className="flex h-6 items-center rounded-full bg-[var(--mark-accent)] px-2.5 text-xs font-bold text-[var(--lp-ink)]">Novo</span>
          Assembleias com voto por unidade e ata pronta
        </span>
        <h1 className="max-w-[980px] font-display text-[42px] font-bold leading-[1.02] tracking-[-0.045em] sm:text-[60px] lg:text-[72px]">
          Cada demanda do condomínio, do pedido <span className="text-[var(--mark-accent)]">à aprovação.</span>
        </h1>
        <p className="max-w-[640px] text-[17px] leading-relaxed text-white/70 sm:text-[19px]">
          O síndico vê tudo o que está aberto, quem está cuidando e o que já foi conferido. Zelador, portaria, conselho, prestadores e
          moradores participam, cada um com o seu acesso.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <a href="#demonstracao" className="btn-brand flex h-14 items-center gap-2.5 rounded-full px-7 text-base font-bold shadow-[0_12px_40px_var(--lp-glow)]">
            Agendar demonstração<ArrowRight className="size-5" />
          </a>
          <a href="#demandas" className="flex h-14 items-center rounded-full border border-white/20 px-6 text-base font-bold transition hover:bg-white/[0.06]">Ver como funciona</a>
        </div>
        <span className="text-[13px] text-white/50">Demonstração com dados de exemplo em todas as áreas · {trialDays} dias grátis ao assinar</span>
      </div>

      <div className={cx(WRAP, "relative mt-12 sm:mt-16")}>
        <Notice className="left-0 top-[380px] xl:-left-14" icon={Check} tone="teal" title="Pintura da quadra conferida" text="O zelador aprovou o serviço. Falta você." />
        <Notice className="right-0 top-[220px] xl:-right-14 [animation-delay:-3s]" icon={Package} tone="warn" title="Encomenda chegou para o 502" text="A portaria guardou no armário B e avisou o morador." />
        <div className="absolute -bottom-7 left-1/2 z-10 hidden -translate-x-1/2 items-center gap-3 whitespace-nowrap rounded-full border border-white/15 bg-[var(--lp-ink)] py-2 pl-2 pr-5 shadow-[0_20px_50px_rgb(0_0_0/0.45)] lg:flex">
          <span className="flex">
            {[["SÍ", "bg-brand"], ["ZE", "bg-[var(--chart-2)]"], ["PO", "bg-info"], ["MO", "bg-ok"]].map(([t, bg], i) => (
              <span key={t} className={cx("flex size-[30px] items-center justify-center rounded-full border-2 border-[var(--lp-ink)] text-[11px] font-extrabold text-white", bg, i > 0 && "-ml-2")}>{t}</span>
            ))}
          </span>
          <span className="text-[13px] font-semibold">Síndico, zelador, portaria e moradores no mesmo condomínio, cada um com seu acesso</span>
        </div>
        <div className="lg:mx-[120px]">
          <div className="rounded-3xl bg-gradient-to-b from-white/16 to-white/[0.03] p-2 shadow-[0_40px_120px_rgb(0_0_0/0.55)] sm:p-2.5">
            <DashboardMock />
          </div>
        </div>
      </div>
    </section>
  );
}

/** Notificação que chega ao síndico enquanto ele olha o painel (fica na margem, sem cobrir o painel). */
function Notice({ className, icon: Icon, tone, title, text }: { className: string; icon: LucideIcon; tone: Tone; title: string; text: string }) {
  return (
    <div className={cx("lp-float absolute z-10 hidden w-[272px] flex-col gap-2.5 rounded-[18px] bg-surface/[0.97] p-3.5 pt-3 text-left text-fg shadow-[0_24px_60px_rgb(0_0_0/0.4)] lg:flex", className)}>
      <span className="flex items-center gap-1.5 text-[11px] font-bold tracking-wide text-muted">
        <LogoMark size={16} />
        <span className="flex-1">CONDTRACK · NOTIFICAÇÃO</span>
        <span className="font-semibold tracking-normal">agora</span>
      </span>
      <span className="flex items-center gap-3">
        <span className={cx("flex size-[38px] shrink-0 items-center justify-center rounded-xl", TONE[tone].soft, TONE[tone].text)}><Icon className="size-5" /></span>
        <span className="flex flex-col gap-0.5">
          <b className="text-[13.5px]">{title}</b>
          <span className="text-xs text-fg-2">{text}</span>
        </span>
      </span>
    </div>
  );
}

function DashboardMock() {
  const nav = ["Início", "Ordens de serviço", "Portaria", "Financeiro", "Assembleias", "Reservas", "Fornecedores"];
  const tiles: { label: string; value: string; hint: string; cls: string }[] = [
    { label: "OS em aberto", value: "7", hint: "2 com prazo vencendo", cls: "text-fg" },
    { label: "Para aprovar", value: "2", hint: "já conferidas", cls: "text-brand" },
    { label: "Chamados novos", value: "3", hint: "de moradores", cls: "text-warn" },
    { label: "Saldo do mês", value: "R$ 18,4 mil", hint: "receitas − despesas", cls: "text-ok" },
  ];
  const todo: { icon: LucideIcon; title: string; sub: string; tone: Tone }[] = [
    { icon: Check, title: "Aprovar: pintura da quadra", sub: "Conferida pelo zelador há 2 h", tone: "brand" },
    { icon: FileCheck2, title: "Orçamento: elevadores", sub: "3 propostas para comparar", tone: "warn" },
    { icon: MessageSquareText, title: "Chamado #42: luz no 5º andar", sub: "Aberto pelo apto 502", tone: "bad" },
  ];
  return (
    <div className="flex min-h-[480px] overflow-hidden rounded-2xl bg-bg text-left text-fg">
      <aside className="hidden w-[210px] shrink-0 flex-col gap-1 border-r border-line bg-surface px-3.5 py-[18px] md:flex">
        <span className="flex items-center gap-2 px-2 pb-4 pt-1.5">
          <LogoMark size={24} />
          <b className="font-brand text-[15px] tracking-[-0.03em]">cond<span className="text-brand">track</span></b>
        </span>
        <span className="mb-1 flex flex-col rounded-[10px] bg-bg-2 px-2.5 py-2 text-xs"><b>Residencial Aurora</b><span className="text-muted">Síndica</span></span>
        {nav.map((n, i) => (
          <span key={n} className={cx("rounded-[9px] px-2.5 py-2 text-[13px] font-semibold", i === 0 ? "bg-brand-soft text-brand" : "text-fg-2")}>{n}</span>
        ))}
      </aside>
      <div className="flex min-w-0 flex-1 flex-col gap-4 p-4 sm:p-6">
        <div className="flex items-end justify-between gap-4">
          <span className="flex flex-col gap-0.5">
            <span className="text-xs font-semibold text-brand">Residencial Aurora · 96 unidades</span>
            <b className="font-display text-2xl tracking-[-0.03em]">Olá, Helena</b>
          </span>
          <span className="btn-brand flex h-9 items-center gap-1 rounded-[10px] px-3.5 text-[13px] font-bold"><Plus className="size-4" />Nova OS</span>
        </div>
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {tiles.map((t) => (
            <div key={t.label} className="flex flex-col gap-1 rounded-[14px] border border-line bg-surface p-3.5 shadow-card">
              <span className="text-xs text-fg-2">{t.label}</span>
              <b className={cx("whitespace-nowrap font-num text-[22px] tracking-[-0.03em]", t.cls)}>{t.value}</b>
              <span className="text-[11px] text-muted">{t.hint}</span>
            </div>
          ))}
        </div>
        <div className="grid gap-3.5 sm:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
          <div className="overflow-hidden rounded-[14px] border border-line bg-surface shadow-card">
            <b className="block px-4 pb-2.5 pt-3.5 text-sm">Precisa de você</b>
            {todo.map((d) => (
              <div key={d.title} className="flex items-center gap-3 border-t border-line px-4 py-2.5">
                <span className={cx("flex size-[34px] shrink-0 items-center justify-center rounded-[10px]", TONE[d.tone].soft, TONE[d.tone].text)}><d.icon className="size-4" /></span>
                <span className="flex min-w-0 flex-1 flex-col"><b className="truncate text-[13px]">{d.title}</b><span className="truncate text-[11.5px] text-fg-2">{d.sub}</span></span>
                <span className="text-[11px] font-bold text-brand">Abrir</span>
              </div>
            ))}
          </div>
          <div className="relative min-h-[210px] overflow-hidden rounded-[14px]">
            <Image src={SERVICE("entrada-2")} alt="Entrada do prédio depois da reforma" fill sizes="(min-width: 1024px) 400px, 90vw" className="object-cover" priority />
            <span aria-hidden className="absolute inset-0 bg-gradient-to-b from-transparent from-40% to-black/80" />
            <span className="absolute left-3.5 top-3.5 flex h-6 items-center rounded-full bg-[var(--mark-accent)] px-2.5 text-[11px] font-extrabold text-[var(--lp-ink)]">Aprovada</span>
            <span className="absolute inset-x-4 bottom-3.5 flex flex-col gap-0.5 text-white">
              <b className="text-[15px]">Reforma da entrada social</b>
              <span className="text-xs text-white/75">Antes e depois conferidos · 21 out</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────── Demandas ─────────── */

type BoardCard = { code: string; title: string; who: string; av: string; avTone: Tone; due: string; dueTone: Tone; photo?: string; alt?: string };

function Demands() {
  const board: { title: string; count: number; dot: Tone; cards: BoardCard[] }[] = [
    { title: "Abertas", count: 3, dot: "muted", cards: [
      { code: "OS-0142", title: "Luz piscando no corredor do 5º andar", who: "Aguardando prestador", av: "HD", avTone: "brand", due: "Hoje", dueTone: "warn" },
      { code: "OS-0139", title: "Portão de pedestres não fecha", who: "Elétrica Silva", av: "ES", avTone: "warn", due: "Atrasada", dueTone: "bad" },
    ] },
    { title: "Em execução", count: 2, dot: "warn", cards: [
      { code: "OS-0137", title: "Revisão anual dos elevadores", who: "Elevar Elevadores", av: "EL", avTone: "warn", due: "3 dias", dueTone: "ok" },
      { code: "OS-0135", title: "Vazamento na garagem G2", who: "Hidráulica Lima", av: "HL", avTone: "warn", due: "Amanhã", dueTone: "warn" },
    ] },
    { title: "Conferidas pelo zelador", count: 2, dot: "teal", cards: [
      { code: "OS-0128", title: "Pintura da quadra poliesportiva", who: "Conferida por Rafael", av: "RF", avTone: "teal", due: "Aprovar", dueTone: "warn", photo: SERVICE("quadra-1"), alt: "Quadra antes da pintura" },
    ] },
    { title: "Aprovadas", count: 24, dot: "ok", cards: [
      { code: "OS-0124", title: "Limpeza da caixa d’água", who: "Aprovada por Helena", av: "HD", avTone: "brand", due: "No feed", dueTone: "ok" },
      { code: "OS-0121", title: "Troca de lâmpadas do hall", who: "Aprovada por Helena", av: "HD", avTone: "brand", due: "No feed", dueTone: "ok" },
    ] },
  ];
  const callouts: { icon: LucideIcon; title: string; text: string; tone: Tone }[] = [
    { icon: Clock3, title: "Atrasou, você sabe", text: "Prazos vencidos aparecem em destaque e você recebe o aviso na hora.", tone: "bad" },
    { icon: Rows3, title: "Nada se perde", text: "Cada etapa fica registrada com quem fez e quando. O histórico é a sua prestação de contas.", tone: "brand" },
    { icon: Check, title: "Morador acompanha", text: "O chamado do morador vira OS, e ele é avisado quando o serviço é aprovado.", tone: "ok" },
  ];
  return (
    <section id="demandas" className="py-16 sm:py-[88px]">
      <div className={cx(WRAP, "flex flex-col gap-10")}>
        <div className="grid items-end gap-6 lg:grid-cols-2 lg:gap-12">
          <div className="flex flex-col gap-4">
            <span className={cx(EYEBROW, "text-brand")}>Acompanhamento de demandas</span>
            <h2 className={H2}>Você sabe onde está cada pedido, sem perguntar a ninguém.</h2>
          </div>
          <p className="text-[17px] leading-relaxed text-fg-2 sm:text-lg">
            Toda demanda vira uma ordem de serviço com responsável, prazo e etapas. Ela anda sozinha pelo quadro: o prestador registra, o
            zelador confere no local e só chega até você o que está pronto para aprovar.
          </p>
        </div>

        <div className="no-scrollbar -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <div className="min-w-[1040px] rounded-[28px] border border-line bg-surface p-4 shadow-[0_30px_80px_-30px_rgb(16_18_60/0.25)] sm:p-5">
            <div className="grid grid-cols-4 gap-4">
              {board.map((col) => (
                <div key={col.title} className="flex flex-col gap-3 rounded-[18px] bg-bg-2 p-3.5">
                  <div className="flex items-center gap-2 px-1 py-0.5">
                    <span className={cx("size-[9px] rounded-full", TONE[col.dot].dot)} />
                    <b className="flex-1 text-sm">{col.title}</b>
                    <span className="rounded-full bg-surface px-2.5 py-0.5 font-mono text-xs text-fg-2">{col.count}</span>
                  </div>
                  {col.cards.map((c) => (
                    <div key={c.code} className="flex flex-col overflow-hidden rounded-[14px] border border-line bg-surface">
                      {c.photo && (
                        <span className="relative block h-[110px]">
                          <Image src={c.photo} alt={c.alt ?? ""} fill sizes="260px" className="object-cover" />
                        </span>
                      )}
                      <div className="flex flex-col gap-2 px-3 py-3">
                        <span className="font-mono text-[11px] text-muted">{c.code}</span>
                        <b className="text-sm leading-snug">{c.title}</b>
                        <span className="flex items-center gap-2">
                          <span className={cx("flex size-6 items-center justify-center rounded-full text-[10px] font-extrabold", TONE[c.avTone].soft, TONE[c.avTone].text)}>{c.av}</span>
                          <span className="flex-1 text-xs text-fg-2">{c.who}</span>
                          <span className={cx("rounded-full px-2 py-0.5 text-[11px] font-bold", TONE[c.dueTone].soft, TONE[c.dueTone].text)}>{c.due}</span>
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {callouts.map((k) => (
            <div key={k.title} className="flex items-start gap-4">
              <span className={cx("flex size-11 shrink-0 items-center justify-center rounded-[14px]", TONE[k.tone].soft, TONE[k.tone].text)}><k.icon className="size-[22px]" /></span>
              <span className="flex flex-col gap-1.5"><b className="text-[17px]">{k.title}</b><span className="text-[15px] leading-relaxed text-fg-2">{k.text}</span></span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────────── Prova: antes e depois ─────────── */

function Proof() {
  return (
    <section className="lp-ink py-16 sm:py-20">
      <div className={cx(WRAP, "grid items-center gap-12 lg:grid-cols-2 lg:gap-16")}>
        <div className="flex flex-col gap-5">
          <span className={cx(EYEBROW, "text-[var(--mark-accent)]")}>Prova em cada serviço</span>
          <h2 className={cx(H2, "lg:text-[48px]")}>Sem foto do antes, o serviço não começa. Sem foto do depois, não termina.</h2>
          <p className="text-[17px] leading-relaxed text-white/70">
            Data, local e autor ficam guardados em cada registro. Na assembleia, a resposta para “isso foi feito mesmo?” está a um clique, e os
            moradores acompanham pelo feed de serviços entregues.
          </p>
          <div className="flex flex-wrap gap-2.5">
            {["Registrado por Carlos · Elétrica Silva", "Conferido pelo zelador"].map((t) => (
              <span key={t} className="flex h-[34px] items-center rounded-full border border-white/15 px-3.5 text-[13px] text-white/85">{t}</span>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <BeforeAfterPhoto src={SERVICE("piscina-1")} alt="Piscina antes da manutenção" label="Antes · 12 out" />
          <BeforeAfterPhoto src={SERVICE("piscina-2")} alt="Piscina depois da manutenção" label="Depois · 14 out" after />
        </div>
      </div>
    </section>
  );
}

function BeforeAfterPhoto({ src, alt, label, after }: { src: string; alt: string; label: string; after?: boolean }) {
  return (
    <figure className={cx("relative aspect-[4/5] overflow-hidden rounded-[22px]", after && "mt-12")}>
      <Image src={src} alt={alt} fill sizes="(min-width: 1024px) 290px, 45vw" className="object-cover" />
      <figcaption className={cx("absolute left-3 top-3 flex h-7 items-center rounded-full px-3 text-xs font-bold", after ? "bg-[var(--mark-accent)] text-[var(--lp-ink)]" : "bg-black/60 text-white")}>{label}</figcaption>
    </figure>
  );
}

/* ─────────── Acessos ─────────── */

function Access() {
  const roles: { role: string; does: string; seeTitle: string; seeSub: string; tag: string; hidden: string; icon: LucideIcon; tone: Tone }[] = [
    { role: "Síndico", does: "Aprova, decide e acompanha tudo", seeTitle: "2 ordens de serviço para aprovar", seeSub: "Conferidas pelo zelador", tag: "Aprovar", hidden: "nada fica de fora", icon: ShieldCheck, tone: "brand" },
    { role: "Zelador", does: "Rotina do dia e vistoria dos serviços", seeTitle: "Checklist de hoje · 8 de 10", seeSub: "Prazo às 10h", tag: "Em dia", hidden: "financeiro e assembleias", icon: ListChecks, tone: "teal" },
    { role: "Portaria", does: "Entradas, visitantes e encomendas", seeTitle: "Visitante para o 1204", seeSub: "Autorizado pelo morador hoje", tag: "Liberar", hidden: "ordens de serviço e financeiro", icon: Building2, tone: "info" },
    { role: "Conselho", does: "Acompanha as contas e os serviços", seeTitle: "Financeiro de outubro", seeSub: "Só leitura, liberado pelo síndico", tag: "Ver", hidden: "portaria e fornecedores", icon: BarChart3, tone: "violet" },
    { role: "Prestador", does: "Recebe a OS e registra o trabalho", seeTitle: "OS-0139 · Portão de pedestres", seeSub: "Fotos do antes pendentes", tag: "Iniciar", hidden: "tudo que não é dele", icon: Wrench, tone: "warn" },
    { role: "Morador", does: "Reserva, abre chamado e vota", seeTitle: "Encomenda na portaria", seeSub: "Armário B · chegou às 9h", tag: "Retirar", hidden: "dados dos outros moradores", icon: Home, tone: "ok" },
  ];
  const condos = [
    { ini: "RA", name: "Residencial Aurora", role: "Síndica · 96 unidades", tag: "Em uso" },
    { ini: "MB", name: "Maison Belvedere", role: "Síndica profissional · 24 unidades", tag: "" },
    { ini: "PI", name: "Parque dos Ipês", role: "Conselho · 140 unidades", tag: "" },
  ];
  return (
    <section id="acessos" className="py-16 sm:py-[88px]">
      <div className={cx(WRAP, "flex flex-col gap-9")}>
        <div className="flex max-w-[780px] flex-col gap-4">
          <span className={cx(EYEBROW, "text-brand")}>Vários acessos, um condomínio</span>
          <h2 className={H2}>Cada pessoa entra com o seu login e vê só o que é dela.</h2>
          <p className="text-[17px] leading-relaxed text-fg-2 sm:text-lg">
            Você convida a equipe e os moradores; o sistema já sabe o que cada perfil pode fazer. Nada de senha compartilhada nem planilha aberta
            para todo mundo.
          </p>
        </div>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <div className="grid gap-3.5 sm:grid-cols-2">
            {roles.map((r) => (
              <div key={r.role} className="flex flex-col gap-3.5 rounded-3xl border border-line bg-surface p-5 shadow-card">
                <span className="flex items-center gap-3">
                  <span className={cx("flex size-[42px] items-center justify-center rounded-[14px]", TONE[r.tone].soft, TONE[r.tone].text)}><r.icon className="size-[21px]" /></span>
                  <span className="flex flex-1 flex-col"><b className="text-base">{r.role}</b><span className="text-[13px] text-fg-2">{r.does}</span></span>
                </span>
                <span className="flex items-center gap-2.5 rounded-[14px] bg-bg-2 px-3.5 py-3">
                  <span className={cx("size-2 shrink-0 rounded-full", TONE[r.tone].dot)} />
                  <span className="flex min-w-0 flex-1 flex-col gap-px"><b className="truncate text-[13px]">{r.seeTitle}</b><span className="truncate text-xs text-fg-2">{r.seeSub}</span></span>
                  <span className={cx("whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-bold", TONE[r.tone].soft, TONE[r.tone].text)}>{r.tag}</span>
                </span>
                <span className="text-xs text-muted">Não vê: {r.hidden}</span>
              </div>
            ))}
          </div>

          <div className="lp-banner relative flex flex-col gap-4 overflow-hidden rounded-[28px] p-7 text-white sm:p-8">
            <span className={cx(EYEBROW, "text-[color-mix(in_srgb,var(--mark-accent)_55%,white)]")}>Síndico profissional e administradora</span>
            <b className="font-display text-[28px] leading-[1.15] tracking-[-0.03em]">Todos os seus condomínios num só login.</b>
            <span className="text-[15px] leading-relaxed text-white/80">Troque de prédio em um toque. Em cada um, você entra com o papel certo: síndico num, conselheiro no outro.</span>
            <div className="mt-auto overflow-hidden rounded-[18px] border border-white/18 bg-white/10">
              {condos.map((c, i) => (
                <div key={c.name} className={cx("flex items-center gap-3 border-white/12 px-3.5 py-3", i > 0 && "border-t", i === 0 && "bg-white/[0.08]")}>
                  <span className="flex size-[34px] items-center justify-center rounded-[10px] bg-white/18 text-xs font-extrabold">{c.ini}</span>
                  <span className="flex min-w-0 flex-1 flex-col"><b className="truncate text-sm">{c.name}</b><span className="truncate text-xs text-white/75">{c.role}</span></span>
                  {c.tag && <span className="text-xs font-bold text-[color-mix(in_srgb,var(--mark-accent)_55%,white)]">{c.tag}</span>}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─────────── Recursos ─────────── */

function Features() {
  const gate: { t: string; s: string; tone: Tone }[] = [
    { t: "Encomenda · Mercado Livre", s: "Armário B", tone: "warn" },
    { t: "Marina Lopes · visitante", s: "Autorizada hoje", tone: "ok" },
    { t: "Ana e Pedro Souza", s: "Moradores", tone: "brand" },
  ];
  const features: { icon: LucideIcon; title: string; text: string }[] = [
    { icon: Vote, title: "Assembleias online", text: "Um voto por unidade, apuração automática e ata pronta para assinar." },
    { icon: CalendarDays, title: "Reservas", text: "Calendário das áreas comuns com lista de convidados que chega à portaria." },
    { icon: Store, title: "Fornecedores", text: "Orçamentos lado a lado, com a economia calculada e o histórico de contratos." },
    { icon: Wrench, title: "Manutenção preventiva", text: "Planos que abrem a OS antes do vencimento e avisam de alvarás e seguros." },
    { icon: ClipboardCheck, title: "Checklist do zelador", text: "A rotina do dia com prazo, fotos e alerta quando atrasa." },
    { icon: MessageSquareText, title: "Chamados dos moradores", text: "Problemas e sugestões com conversa registrada e resposta do síndico." },
  ];
  return (
    <section id="recursos" className="pb-16 sm:pb-[88px]">
      <div className={cx(WRAP, "flex flex-col gap-8")}>
        <h2 className={cx(H2, "max-w-[760px]")}>Todo o condomínio no mesmo lugar.</h2>
        <div className="grid gap-4 lg:grid-cols-6">
          <div className="grid items-center gap-6 rounded-[28px] border border-line bg-surface p-6 shadow-card sm:p-8 md:grid-cols-2 lg:col-span-4">
            <div className="flex flex-col gap-2.5">
              <span className="text-xs font-bold uppercase tracking-[0.13em] text-brand">Portaria</span>
              <b className="font-display text-[26px] leading-[1.15] tracking-[-0.03em]">Digite a unidade e a portaria vê tudo dela.</b>
              <span className="text-[15px] leading-relaxed text-fg-2">Moradores, autorizados do dia e encomendas paradas. Quem recebe pacote é avisado com o local onde ficou.</span>
            </div>
            <div className="flex flex-col gap-2.5 rounded-[18px] bg-bg-2 p-4">
              <span className="flex h-11 items-center rounded-xl border-[1.5px] border-brand bg-surface px-3.5 font-mono text-sm">
                aurora 502<span className="ml-0.5 h-[18px] w-0.5 animate-pulse bg-brand" />
              </span>
              {gate.map((g) => (
                <span key={g.t} className="flex items-center gap-2.5 rounded-xl bg-surface px-3 py-2.5 text-[13px]">
                  <span className={cx("size-2 rounded-full", TONE[g.tone].dot)} />
                  <b className="flex-1">{g.t}</b>
                  <span className="text-fg-2">{g.s}</span>
                </span>
              ))}
            </div>
          </div>
          <div className="lp-ink flex flex-col gap-2.5 rounded-[28px] p-6 sm:p-8 lg:col-span-2">
            <span className="text-xs font-bold uppercase tracking-[0.13em] text-[var(--mark-accent)]">Financeiro</span>
            <b className="font-display text-[26px] leading-[1.15] tracking-[-0.03em]">Cada real com nota anexada.</b>
            <span className="text-[15px] leading-relaxed text-white/70">Orçamento do ano, histórico de alterações e acesso só de leitura para o conselho.</span>
            <b className="mt-auto pt-4 font-num text-[40px] tracking-[-0.04em] text-[var(--mark-accent)]">R$ 18.420,55</b>
            <span className="text-xs text-white/50">Saldo de outubro · exemplo</span>
          </div>
          {features.map((f) => (
            <div key={f.title} className="flex flex-col gap-2.5 rounded-[28px] border border-line bg-surface p-6 shadow-card sm:p-7 lg:col-span-2">
              <span className="flex size-11 items-center justify-center rounded-[14px] bg-brand-soft text-brand"><f.icon className="size-[22px]" /></span>
              <b className="text-lg">{f.title}</b>
              <span className="text-[15px] leading-relaxed text-fg-2">{f.text}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────────── Planos ─────────── */

function Plans({ plans, trialDays }: { plans: LandingPlan[]; trialDays: number }) {
  return (
    <section id="planos" className="border-y border-line bg-surface py-16 sm:py-[88px]">
      <div className={cx(WRAP, "flex flex-col items-center gap-8")}>
        <div className="flex flex-col items-center gap-3.5 text-center">
          <h2 className={H2}>Um preço pelo condomínio. Acessos à vontade.</h2>
          <p className="text-[17px] text-fg-2 sm:text-lg">Equipe, conselho e moradores entram sem custo por pessoa. {trialDays} dias grátis para começar.</p>
        </div>
        <div className={cx("grid w-full items-stretch gap-4", plans.length >= 3 ? "lg:grid-cols-3" : plans.length === 2 ? "md:grid-cols-2" : "max-w-md")}>
          {plans.map((p) => (
            <div
              key={p.key}
              className={cx(
                "flex flex-col gap-4 rounded-[28px] border p-7 sm:p-8",
                p.featured ? "lp-ink border-transparent shadow-[0_30px_80px_-20px_rgb(16_18_60/0.45)]" : "border-line bg-bg",
              )}
            >
              <span className="flex items-center justify-between gap-3">
                <b className="text-lg">{p.name}</b>
                {p.featured && <span className="text-[11px] font-extrabold uppercase tracking-wider text-[var(--mark-accent)]">Recomendado</span>}
              </span>
              <span className={cx("text-sm", p.featured ? "text-white/70" : "text-fg-2")}>{p.size}</span>
              <span className="font-num text-[44px] font-bold leading-none tracking-[-0.04em]">
                {p.monthly}<span className={cx("ml-1 text-[15px] font-medium tracking-normal", p.featured ? "text-white/60" : "text-muted")}>/mês</span>
              </span>
              {p.yearly && <span className={cx("-mt-1 text-[13px]", p.featured ? "text-white/60" : "text-muted")}>ou {p.yearly}</span>}
              <span className={cx("h-px", p.featured ? "bg-white/14" : "bg-line")} />
              {p.features.map((i) => (
                <span key={i} className="flex gap-2.5 text-[15px]">
                  <Check className={cx("mt-0.5 size-4 shrink-0", p.featured ? "text-[var(--mark-accent)]" : "text-brand")} strokeWidth={3} />{i}
                </span>
              ))}
              <a
                href="#demonstracao"
                className={cx("mt-auto flex h-[52px] items-center justify-center rounded-full font-bold transition", p.featured ? "btn-brand" : "bg-brand-soft text-brand hover:bg-brand/15")}
              >
                Agendar demonstração
              </a>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────────── Perguntas ─────────── */

function Faq({ trialDays }: { trialDays: number }) {
  const faq = [
    { q: "Moradores e equipe pagam alguma coisa?", a: "Não. O plano é do condomínio e os acessos são à vontade: síndico, zelador, portaria, conselho, prestadores e moradores." },
    { q: "Funciona no computador e no celular?", a: "Sim. Basta entrar pelo navegador; quem quiser coloca um atalho na tela de início e recebe as notificações no celular." },
    { q: "Como é a demonstração?", a: "Montamos um condomínio de exemplo com dados em todas as áreas e mandamos um acesso para cada perfil. Você testa com a sua equipe pelo tempo combinado." },
    { q: "Como começo sem perder o que já tenho?", a: `Você cadastra torres e unidades, convida a equipe e abre as primeiras ordens de serviço. A assinatura começa com ${trialDays} dias grátis e ajudamos na implantação.` },
    { q: "Dá para administrar vários condomínios?", a: "Sim. Síndicos profissionais e administradoras trocam de prédio sem sair da conta, com o papel certo em cada um." },
    { q: "E a segurança dos dados?", a: "Login com verificação em duas etapas, histórico de ações e regras da LGPD, com exportação dos dados de cada pessoa." },
  ];
  return (
    <section className="py-16 sm:py-20">
      <div className={cx(WRAP, "grid gap-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-14")}>
        <div className="flex flex-col gap-3.5">
          <h2 className={cx(H2, "lg:text-[44px]")}>Perguntas de quem está chegando</h2>
          <span className="text-base text-fg-2">Não achou a sua? <a href="#demonstracao" className="font-bold text-brand hover:underline">Fale com a gente</a></span>
        </div>
        <div className="flex flex-col">
          {faq.map((f, i) => (
            <details key={f.q} className="group border-b border-line py-5" open={i === 0}>
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 [&::-webkit-details-marker]:hidden">
                <b className="text-[17px]">{f.q}</b>
                <Plus className="size-5 shrink-0 text-brand transition group-open:rotate-45" aria-hidden />
              </summary>
              <p className="mt-2.5 text-[15px] leading-relaxed text-fg-2">{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────────── Chamada final e formulário ─────────── */

function FinalCall({ turnstileSiteKey }: { turnstileSiteKey: string | null }) {
  const perks = ["Condomínio de exemplo pronto em minutos", "Acessos de teste para síndico, zelador, portaria e moradores", "Sem cartão e sem compromisso"];
  return (
    <section id="demonstracao" className="pb-16 sm:pb-[72px]">
      <div className="mx-auto w-full max-w-[1200px] sm:px-8">
        <div className="lp-ink relative overflow-hidden px-4 py-12 sm:rounded-[36px] sm:px-10 sm:py-14 lg:px-14">
          <div aria-hidden className="absolute inset-0 bg-[radial-gradient(55%_80%_at_0%_100%,var(--lp-glow)_0%,transparent_70%),radial-gradient(40%_50%_at_100%_0%,color-mix(in_srgb,var(--mark-accent)_18%,transparent)_0%,transparent_70%)]" />
          <div className="relative grid items-center gap-10 lg:grid-cols-2 lg:gap-14">
            <div className="flex flex-col gap-5">
              <span className="flex size-[60px] items-center justify-center rounded-[18px] bg-white/[0.08]">
                <svg viewBox="0 0 64 64" width={60} height={60} aria-hidden><MarkShapes /></svg>
              </span>
              <h2 className={cx(H2, "lg:text-[50px]")}>Sua próxima assembleia já pode começar com tudo conferido.</h2>
              <p className="text-[17px] leading-relaxed text-white/70">
                Deixe seu contato e montamos um condomínio de exemplo para você ver com a sua equipe, com dados em todas as áreas.
              </p>
              <div className="flex flex-col gap-3">
                {perks.map((k) => (
                  <span key={k} className="flex items-center gap-3 text-[15px] text-white/90">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--mark-accent)_16%,transparent)] text-[var(--mark-accent)]"><Check className="size-3.5" strokeWidth={3} /></span>
                    {k}
                  </span>
                ))}
              </div>
            </div>
            <div className="relative">
              <DemoForm turnstileSiteKey={turnstileSiteKey} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─────────── Rodapé ─────────── */

function Footer({ legal }: { legal: LandingProps["legal"] }) {
  const cols: { title: string; links: [string, string][] }[] = [
    { title: "Produto", links: [["#demandas", "Demandas e OS"], ["#recursos", "Portaria"], ["#recursos", "Financeiro"], ["#recursos", "Assembleias"]] },
    { title: "Para quem", links: [["#acessos", "Síndicos"], ["#acessos", "Administradoras"], ["#acessos", "Conselhos"], ["#acessos", "Moradores"]] },
    { title: "Acesso", links: [["#demonstracao", "Agendar demonstração"], ["/login", "Entrar"], ["/esqueci-senha", "Esqueci minha senha"]] },
  ];
  const company = [legal.companyName, legal.cnpj && `CNPJ ${legal.cnpj}`].filter(Boolean).join(" · ");
  return (
    <footer className="mt-auto border-t border-line bg-surface">
      <div className={cx(WRAP, "grid grid-cols-2 gap-8 pb-9 pt-12 lg:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))]")}>
        <div className="col-span-2 flex flex-col gap-3.5 lg:col-span-1">
          <Logo tagline={false} size={32} />
          <span className="max-w-[300px] text-sm leading-relaxed text-fg-2">Gestão condominial com cada serviço registrado, conferido e aprovado.</span>
        </div>
        {cols.map((col) => (
          <div key={col.title} className="flex flex-col gap-3">
            <b className="text-[13px] uppercase tracking-wider text-muted">{col.title}</b>
            {col.links.map(([href, label]) =>
              href.startsWith("/") ? (
                <Link key={label} href={href} className="text-[15px] text-fg transition hover:text-brand">{label}</Link>
              ) : (
                <a key={label} href={href} className="text-[15px] text-fg transition hover:text-brand">{label}</a>
              ),
            )}
          </div>
        ))}
      </div>
      <div className={cx(WRAP, "flex flex-wrap justify-between gap-4 border-t border-line pb-7 pt-5 text-[13px] text-muted")}>
        <span>© {new Date().getFullYear()} condtrack{company && ` · ${company}`}</span>
        <span className="flex gap-4">
          <Link href="/termos" className="hover:text-fg">Termos de uso</Link>
          <Link href="/privacidade" className="hover:text-fg">Política de privacidade</Link>
        </span>
      </div>
    </footer>
  );
}
