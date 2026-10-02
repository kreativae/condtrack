@AGENTS.md

# Condtrack: contexto para retomar o trabalho

Leia o `README.md` para produto, stack, perfis, fluxo da OS e deploy. Este arquivo guarda o que o README não diz:
como trabalhamos, o que não pode quebrar e onde cada coisa mora. Atualize-o junto com mudanças que alterem essas regras.

## Como trabalhamos

- Tudo em português (textos da UI, commits, comentários). Commits descrevem a funcionalidade: `Área: o que mudou`.
- Trabalho direto na `main`; a Vercel publica cada push em produção. **Pergunte antes de dar push.**
- Um commit por ajuste, com push logo em seguida, para nada ficar preso numa máquina só.
- Se um build falhar na Vercel, o site continua na versão anterior; corrija na `main`.
- Pontos de restauração: tags `v1-estavel` (2026-09-28, aba Aparência) e `v2-estavel` (2026-10-04, antes dos vínculos com vários condomínios). Para voltar um arquivo: `git checkout v1-estavel -- caminho`.
- O Mac principal pode não ter Node/npm: sem `npm run build` local, o build da Vercel é a verificação. Escreva com cuidado
  e revise o diff antes de commitar.

## Regras que não podem quebrar

- **Permissões**: toda transição e visibilidade de OS passa por `can()` / `canView()` em `src/lib/workflow.ts`. Server actions
  checam de novo com `requireUser(...)`; a UI nunca é a única barreira.
- **Fluxo da OS**: open → assigned → in_progress (exige ANTES) → completed (exige DEPOIS) → validated (zelador) → approved (síndico, vai ao feed).
  Rejeição volta ao prestador com motivo.
- **Morador (`resident`) é somente leitura.**
- **Auditoria**: ações críticas chamam `audit()` (`src/lib/audit.ts`), inclusive no modo "visualizar como".
- **Mídias**: fotos sem marca d'água; os dados de captura (data, GPS, aparelho) ficam só nos metadados da OS.
- **Financeiro**: nunca apagar lançamentos, anexos ou logs de verdade; o histórico é a prestação de contas.
- **Segredos** em `Setting` são cifrados (AES-256-GCM). Conteúdo público (login, aparência) é JSON puro.

## Onde mora cada coisa (além do README)

- **Cores**: tudo usa variáveis CSS (`--brand`, `--surface`, `--fg`…) de `src/app/globals.css`, expostas ao Tailwind
  como `bg-surface`, `text-brand` etc. **Não use cores fixas** (`#hex`, `bg-slate-*`) em componentes: elas ignoram a aba Aparência.
- **Configurações → Aparência** (`?aba=aparencia`): cores do sistema nos temas claro e escuro. `src/lib/theme-appearance.ts`
  (padrões, derivações, contraste) + `theme-appearance-server.ts`; o layout raiz injeta só as variáveis alteradas.
  `THEME_DEFAULTS` deve bater com `:root` em `globals.css`.
- **Configurações → Página de login**: `src/lib/login-appearance*.ts`. A cor própria do login tem prioridade sobre a Aparência.
- **Configurações → Mensagens**: modelos de notificação e e-mail em `src/lib/messages*.ts`, com histórico de envios.
- **Relatórios** (`/relatorios` → `/relatorio`): prestação de contas do período. `src/lib/report.ts` busca os dados;
  `src/app/relatorio` fica fora do layout do app e é impresso pelo navegador (“Salvar como PDF”), sem biblioteca de PDF.
  Superadmin, síndico e conselho.
- **Financeiro** (`/financeiro`): receitas, despesas e anexos (NF, boleto, comprovante) por condomínio. Regras de acesso em
  `src/lib/finance-server.ts` (`financeAccess()`): superadmin e síndico editam; o conselho só visualiza e só quando
  `Condominium.councilFinanceAccess` está ligado (síndico/superadmin liberam na própria página). Tudo vai para `FinanceLog`
  (criou, editou com antes/depois, visualizou, abriu anexo, excluiu, mudou o acesso), com nome e perfil gravados no log.
  Exclusão é lógica (`deletedAt`), anexos removidos ficam guardados. Arquivos em `/api/financeiro/*` (fora do proxy).
  Relatório financeiro: `FinanceReportPanel` (`financeiro/report-dialog.tsx`) é usado na janela do Financeiro e em
  Relatórios; filtros na URL (`de`/`ate`, `tipo`, `situacao`, `cats` separado por `|`) lidos por `financePeriod()` e
  `financeReportFilter()`. PDF em `/relatorio/financeiro` (`imprimir=1` abre a janela de salvar), CSV em `/api/financeiro/exportar`.
  Superadmin: condomínio em foco no cookie `sa_condo` (`lib/admin-scope*.ts`), escolhido no cartão do menu (`CondoSwitcher`)
  ou ao abrir um condomínio no Financeiro/Checklist. Dashboard, OS, Feed, Usuários, Auditoria e Relatórios respeitam
  (`adminScope(user)`); vazio = todos. Não importe constantes de arquivos "use client" em código de servidor.
- **Ordem do menu**: cada usuário segura e arrasta os itens (desktop e celular, `useReorder` em `nav-links.tsx`); a ordem fica em
  `User.navOrder` (salva por `app/actions/nav.ts`) e o layout aplica. Páginas novas entram no fim da ordem salva.
- **Painel personalizável**: ícone de ajustes no cabeçalho do dashboard (todos menos morador). Blocos de cada perfil em
  `src/lib/dashboard.ts`; escondidos em `User.dashboardHidden`. Bloco novo no painel = nova chave lá + `show("chave")`.
- **Navegação no celular** (`components/nav-links.tsx`): barra de atalhos (até 4, no cookie `nav_pins`, por aparelho) + botão
  Menu que abre o menu lateral com todas as páginas e o alfinete para fixar. Itens vêm de `src/lib/nav.ts`.
- **Janelas e sobreposições** (`fixed inset-0`): renderize com `createPortal(..., document.body)`. A animação `animate-in`
  das páginas prende elementos `fixed` dentro dela no Chrome.
- **Cartões de números** (`Stat` em `ui.tsx`): o tamanho do valor depende só da largura do cartão (`@container`),
  para cartões lado a lado ficarem iguais. Use `fmtBRL()` para dinheiro (sinal de menos que não quebra linha).
- **Checklist do zelador**: `src/lib/checklist*.ts`, `src/app/actions/checklist.ts`, `src/app/api/cron/checklist`.
  Anotações do dia (texto + fotos) em `ChecklistNote`, com a galeria do dia (`components/checklist/day-notes.tsx`).
- **Condomínio de demonstração**: botão do superadmin em `/admin/condominios` → `src/lib/demo-condo.ts` (dados fictícios em
  todas as áreas, vinculado a `sindico@condtrack.app` como síndico). Usuários fictícios têm senha aleatória descartada.
- **Next.js 16**: `src/proxy.ts` (antigo middleware); veja o aviso em `AGENTS.md`.

- **Negociação especial** (`BillingDeal`, `src/lib/billing-deal.ts`): preço por unidade (mensal e anual) por condomínio,
  com mínimo de unidades e dias de teste. No Stripe, um preço por negociação e a assinatura com quantidade = unidades
  cobradas; `Subscription.unitAmount` guarda o total (preço × quantidade). Mudou unidade na Estrutura → `syncDealUnits`
  ajusta a quantidade (só de quem já está na negociação). Com negociação ativa, o síndico só vê a proposta.

- **Esqueci minha senha**: `/esqueci-senha` → e-mail com link de uso único (1 h, `PasswordReset` guarda só o hash;
  `lib/password-reset.ts`) → `/redefinir-senha`. Resposta igual exista ou não a conta; até 3 pedidos/hora por conta.
  Precisa do e-mail ativo; texto no modelo `password_forgot` em Mensagens.

- **Permissões do síndico** (`src/lib/permissions.ts`, `User.permissions`): o superadmin liga em Editar usuário.
  `checklist_edit` = corrigir autor/horário, conferir dias anteriores e editar anotações (`adminSaveCheck`,
  `updateChecklistNote`); `audit` = página `/auditoria` só do condomínio. Use `hasPermission(user, ...)`.

- **Vários condomínios por pessoa** (`Membership`, `src/lib/memberships.ts`): cada vínculo tem condomínio, perfil e
  permissões. `User.condominiumId/role/permissions` = vínculo ATIVO (trocado pelo cartão do menu, `switchCondo`, ou ao abrir
  uma OS de outro vínculo). Para "pessoas do condomínio X" use `inCondo(X, roles)`, nunca `user.condominiumId`.
  Superadmin define os vínculos em Editar usuário ("Outros condomínios"); síndico só gerencia quem tem vínculo apenas
  com o condomínio dele. Página `/meus-condominios` (só com 2+ vínculos).

## Histórico recente

- 2026-09-23 a 25: MVP, Neon + Vercel + Blob, condomínios horizontais, feed com vídeo, configurações de login e mensagens,
  troca de e-mail, visualizador de fotos e metadados, checklist do zelador.
- 2026-09-28: aba Aparência (cores de todas as páginas).
- 2026-09-29: relatórios de serviços em PDF.
- 2026-10-01: Financeiro (lançamentos, notas fiscais, histórico de edição e visualização, acesso do conselho), resumo no
  dashboard, relatório financeiro (CSV/PDF com filtros), menu do celular com atalhos fixáveis e ajustes de responsivo.
  Dados fictícios de demonstração no condomínio Odyssey (jul–out/2026), criados pelo síndico.
- 2026-10-04: vínculos com vários condomínios (síndico profissional, prestadores) e Meus condomínios.
