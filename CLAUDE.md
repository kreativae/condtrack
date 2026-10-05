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
- O GitHub confere tipos, lint (bloqueia erro) e testes a cada push (`.github/workflows/verificacao.yml`); veja a aba
  Actions se algo falhar. Testes das regras de negócio em `src/lib/__tests__` (Vitest, `npm test`): permissões da OS,
  valores do financeiro, datas da manutenção, apuração das assembleias, duas etapas, demonstração. Regra nova = teste novo.
- O Mac principal tem Node pelo nvm (desde 2026-10-03). Antes de commitar: `npx tsc --noEmit` e, em mudanças maiores,
  `npx next build` (com `AUTH_SECRET`, `DATABASE_URL` e `DATABASE_URL_UNPOOLED` fictícios; o `npm run build` roda as
  migrações e precisa do banco de verdade). Em outra máquina sem Node, o build da Vercel continua sendo a verificação.

## Regras que não podem quebrar

- **Permissões**: toda transição e visibilidade de OS passa por `can()` / `canView()` em `src/lib/workflow.ts`. Server actions
  checam de novo com `requireUser(...)`; a UI nunca é a única barreira.
- **Fluxo da OS**: open → assigned → in_progress (exige ANTES) → completed (exige DEPOIS) → validated (zelador) → approved (síndico, vai ao feed).
  Rejeição volta ao prestador com motivo.
- **Morador (`resident`) é somente leitura.** Única exceção: votar em assembleia como proprietário da unidade
  (`castVote`, um voto por unidade em cada item). Inquilino e dependente não votam.
- **Auditoria**: ações críticas chamam `audit()` (`src/lib/audit.ts`), inclusive no modo "visualizar como".
- **Mídias**: fotos sem marca d'água; os dados de captura (data, GPS, aparelho) ficam só nos metadados da OS.
- **Financeiro**: nunca apagar lançamentos, anexos ou logs de verdade; o histórico é a prestação de contas Única exceção: a exclusão
  definitiva de um condomínio arquivado, que exige o backup baixado (ver “Excluir condomínio real”).
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
- **Orçamento** (`/financeiro/orcamento`, botão no Financeiro): `FinanceBudget` = valor do ano por tipo e categoria.
  `src/lib/budget.ts` compara orçado, previsto até o mês (proporcional) e realizado (lançamentos do ano pela competência,
  pagos e pendentes, sem cancelados/excluídos). Salvar substitui as linhas do ano e grava `budget_updated` no `FinanceLog`.
  Mesmo acesso do Financeiro (conselho só vê, se liberado).
- **Estilo do menu do computador** (Configurações → Aparência → Menu lateral; Setting público `menu_style`):
  `classic` (lista), `accordion` (grupos por assunto em `lib/menu-style.ts`, `groupOf()`; abertos lembrados no
  navegador; o grupo da página abre sozinho; arrastar dentro do grupo), `more` (7 primeiros + "Mais") e `compact`.
  Página nova no menu: inclua o grupo dela em `GROUP_OF` (o padrão é "Dia a dia"). No celular o menu não muda.
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
  O alerta de atraso roda a cada 15 min pelo GitHub Actions (`.github/workflows/checklist-atrasado.yml`, precisa do secret
  `CRON_SECRET` e da variable `APP_URL` no GitHub) e também quando alguém abre o app depois do prazo.
  Anotações do dia (texto + fotos) em `ChecklistNote`, com a galeria do dia (`components/checklist/day-notes.tsx`).
- **Excluir condomínio real = arquivar** (`Condominium.deletedAt`, `archiveCondominium`/`restoreCondominium` em
  `actions/admin.ts`): some de todas as listas, do seletor e dos vínculos (filtro `deletedAt: null` em cada consulta de
  condomínios, em `adminScope`, `financeCondo`, `userMemberships` e nas listas globais de OS/feed), mas nada é apagado.
  Quem só tinha esse condomínio fica `inactive` (ids em `archivedUserIds`, reativados ao restaurar). Exige assinatura
  cancelada e digitar o nome. **Lista nova de condomínios precisa do filtro `deletedAt: null`.**
  Arquivado → **Excluir de vez** (`purgeCondominium` em `actions/admin.ts`, `lib/condo-purge.ts`): exige backup baixado nas
  últimas 24 h (`/api/admin/condominios/[id]/backup`, .zip com `dados.json` + anexos do Financeiro, gerado por `lib/zip.ts`;
  registrado na auditoria como `backup`) e o nome digitado. Apaga dados, arquivos e as contas só desse condomínio
  (se alguma estiver presa a outros registros, fica desativada). Sessão que não vale
  mais (conta desativada, condomínio arquivado) passa por `/api/sair`, que limpa o cookie (evita laço login ↔ dashboard).
- **Edição completa do condomínio** (superadmin, página do condomínio): tipo e nomenclatura (casas/lotes acompanham),
  logo (`brand/`), horário do checklist, acesso do conselho (registrado no FinanceLog), ativo e síndicos (`assignSyndic`,
  `removeSyndic`).
- **Condomínio de demonstração**: cada geração sai diferente (nome que ainda não existe, cidade, CNPJ válido fictício,
  torres, pessoas, empresas, OS, valores, pautas): bancos e sorteio com semente em `src/lib/demo-data.ts`.
  Botão do superadmin em `/admin/condominios` → `src/lib/demo-condo.ts` (dados fictícios em
  todas as áreas), vinculado como síndico ao e-mail digitado na janela. Marcados com `Condominium.demo`; só esses têm o botão
  "Excluir demonstração" (`deleteDemoCondominium`: apaga tudo, inclusive as pessoas fictícias, e troca o vínculo ativo de quem é real). Usuários fictícios têm senha aleatória descartada.
- **Manutenção preventiva** (`/manutencao`; superadmin e síndico editam, zelador vê): `MaintenancePlan`, regras de data em
  `src/lib/maintenance.ts` e motor em `maintenance-server.ts` (`runMaintenance`, chamado pelo cron a cada 15 min e ao abrir a
  página). Serviço: abre a OS `leadDays` antes de `nextDue` (atribuída ao prestador do plano) e já avança `nextDue` com
  `updateMany` condicional (nunca abre duas vezes; ciclos atrasados viram uma OS só). Documento: aviso antes (`alertedFor =
  data`) e no vencimento (`data!`) até "Renovado". Sugestões entram pausadas. Modelos `maint_*` em Mensagens.
- **Notificações no celular** (Web Push, `src/lib/push.ts`): toda notificação do app (canal "app" em Mensagens) também vai
  para os aparelhos inscritos (`PushDevice`), pelo `notify()`. Inscrição em Meu perfil (`perfil/push.tsx`); service worker
  em `public/sw.js` (sem cache de páginas). Endereços de inscrição só dos serviços oficiais (anti-SSRF, `actions/push.ts`).
  Precisa de `VAPID_PUBLIC_KEY` e `VAPID_PRIVATE_KEY` (opcional `VAPID_SUBJECT`); sem elas o cartão avisa e nada é enviado.
  iPhone: só com o app na tela de início (iOS 16.4+). Ícones PNG em `public/` e `src/app/apple-icon.png`.
- **Assembleias** (`/assembleias`): `Assembly` → `AssemblyItem` (pauta, opções em JSON) → `AssemblyVote` (único por item e
  unidade). Rascunho → publicar (abre a votação, cria comunicado e avisa) → encerra no prazo (cron/página) ou pelo síndico
  → ata gerada da apuração (`minutesDraft`), editável, em PDF em `/relatorio/ata/[id]`. Quem vota: `voterUnits()` (UserUnit
  "owner" no condomínio). Resultado parcial só para quem organiza, a menos que `showPartial`. Regras em `lib/assembly*.ts`.
  Publicada, só muda por pedido do superadmin (`AssemblyChange`: editar ou excluir) aprovado pelo síndico; itens alterados
  perdem os votos (`describeChange`/`applyAssemblyEdit`), encerrada não muda a pauta.
- **Comunicados**: o superadmin vê os do condomínio em foco e só **pede** a exclusão (`AnnouncementChange`,
  `app/actions/announcements.ts`); o síndico aprova (apaga, conteúdo guardado na auditoria) ou recusa no próprio card.
  O síndico apaga direto só os comunicados que ele mesmo publicou (`deleteOwnAnnouncement`).
  Mesmo padrão das assembleias: um pedido por vez, decisão reservada com `updateMany` condicional.
- **LGPD**: `/termos` e `/privacidade` (abertas a todos, lista `OPEN` no `proxy.ts`; textos em `src/lib/legal.ts`, dados da
  empresa em Configurações → Dados legais). Aceite obrigatório da versão vigente só depois de preencher razão social e
  e-mail do encarregado (`termsVersion()` devolve null antes disso) (`User.termsVersion`; o layout manda para
  `/aceite`; mudar a "versão" em Configurações pede novo aceite de todos). Meu perfil → Privacidade: `/api/meus-dados`
  (JSON com os dados da pessoa) e pedido de exclusão (`deletionRequestedAt`, avisa os superadmins). Textos editáveis na
  mesma aba, abaixo dos dados (Setting público `legal_texts`, guarda só o que difere do padrão; padrões e variáveis
  `{empresa}`, `{cnpj}`… em `src/lib/legal-texts.ts`; leitura por `legalDocument()`/`legalMessages()` em `lib/legal.ts`).
  Textos são modelo: revisar com advogado.
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

- **Verificação em duas etapas** (app autenticador, TOTP): `src/lib/totp.ts` (sem biblioteca, testado com os vetores das
  RFC 6238/4226) e `app/actions/two-factor.ts`. Segredo cifrado em `User.totpSecret` (fica fora do usuário carregado, `omit`
  em `lib/auth.ts`); 10 códigos de recuperação de uso único (só hashes). Login com senha → cookie `condtrack_2fa` (5 min,
  JWT com `p: "2fa"`, que `verifySession` recusa) → `/login/duas-etapas`. O contador de tentativas só zera com o código
  certo. Biometria (passkey) entra direto. Superadmin desliga em Editar usuário; lembrete no dashboard para superadmin e síndico.

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
