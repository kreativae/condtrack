@AGENTS.md

# Condtrack: contexto para retomar o trabalho

Leia o `README.md` para produto, stack, perfis, fluxo da OS e deploy. Este arquivo guarda o que o README não diz:
como trabalhamos, o que não pode quebrar e onde cada coisa mora. Atualize-o junto com mudanças que alterem essas regras.

## Como trabalhamos

- Tudo em português (textos da UI, commits, comentários). Commits descrevem a funcionalidade: `Área: o que mudou`.
- Trabalho direto na `main`; a Vercel publica cada push em produção. **Pergunte antes de dar push.**
- Branch **`server`**: versão para o servidor próprio (Coolify/Hetzner): `Dockerfile`, migrações na subida do
  container e mídias no disco (`UPLOAD_DIR`). Passo a passo em `docs/deploy-coolify.md`. Traga a `main` para a
  `server` com merge para receber as funcionalidades novas.
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
- **Morador (`resident`) é somente leitura** nas OS, no feed e no financeiro. Exceções: votar em assembleia como
  proprietário da unidade (`castVote`, um voto por unidade em cada item; inquilino e dependente não votam), reservar
  áreas comuns com lista de convidados e cadastrar pessoas da própria unidade (Minha unidade).
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
- **Configurações → Aparência → Plataforma** (Setting público `platform_options`, `src/lib/platform-options*.ts`):
  liga/desliga as abas Vercel e Neon (desligar só esconde; o que foi salvo fica) e escolhe os perfis que veem o
  commit em vigor (`components/build-info.tsx`, canto inferior direito no computador; `SOURCE_COMMIT` no Coolify,
  `VERCEL_GIT_*` na Vercel). Padrão: abas visíveis e commit só para o superadmin.
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
  O alerta de atraso roda a cada 15 min e também quando alguém abre o app depois do prazo. Na branch `server`, quem
  chama `/api/cron/checklist` é uma Scheduled Task do Coolify (ver `docs/deploy-coolify.md`, seção 2); o workflow do
  GitHub (`.github/workflows/checklist-atrasado.yml`) fica sem a variable `APP_URL` e não faz nada.
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
  torres, pessoas, empresas, OS, valores, pautas, porteiro, reservas com convidados, pessoas das unidades, entradas
  na portaria e fornecedores com cotações e orçamentos em PDF: uma em andamento com 3 para comparar, encerradas e no histórico): bancos e sorteio com semente em `src/lib/demo-data.ts`.
  Botão do superadmin em `/admin/condominios` → `src/lib/demo-condo.ts` (dados fictícios em
  todas as áreas), vinculado como síndico ao e-mail digitado na janela. Marcados com `Condominium.demo`; só esses têm o botão
  "Excluir demonstração" (`deleteDemoCondominium`: apaga tudo, inclusive as pessoas fictícias, e troca o vínculo ativo de quem é real). Usuários fictícios têm senha aleatória descartada.
- **Manutenção preventiva** (`/manutencao`; superadmin e síndico editam, zelador vê): `MaintenancePlan`, regras de data em
  `src/lib/maintenance.ts` e motor em `maintenance-server.ts` (`runMaintenance`, chamado pelo cron a cada 15 min e ao abrir a
  página). Serviço: abre a OS `leadDays` antes de `nextDue` (atribuída ao prestador do plano) e já avança `nextDue` com
  `updateMany` condicional (nunca abre duas vezes; ciclos atrasados viram uma OS só). Documento: aviso antes (`alertedFor =
  data`) e no vencimento (`data!`) até "Renovado". Sugestões entram pausadas. Modelos `maint_*` em Mensagens.
- **Fornecedores** (`/fornecedores`; zelador, síndico e superadmin): abas Cotações (padrão), Agenda de fornecedores
  (A–Z, busca, filtro por ramo, telefone/WhatsApp/e-mail, arquivados só para quem decide) e Histórico.
  `Supplier` (arquivar = `archivedAt`, os orçamentos ficam) → `SupplierQuote` (pending → approved | rejected, ou
  cancelled por quem cadastrou ou por quem decide enquanto aguarda) → `SupplierQuoteFile` (PDF/foto até 8 MB, pasta
  `quote-<condomínio>`, sobe por `/api/fornecedores/orcamento/[id]/anexos` e abre por `/api/fornecedores/anexo/[id]`,
  fora do proxy e da rota de mídias). O zelador cadastra; só síndico e superadmin decidem (`decideQuote`,
  `updateMany` condicional; recusa exige motivo).
  **Cotação** (`QuoteGroup`, `/fornecedores/cotacao/[id]`): os orçamentos do mesmo serviço juntos e lado a lado.
  Todo orçamento novo entra numa (`resolveGroup` em `actions/suppliers.ts`: a escolhida, senão a aberta com o mesmo
  nome por `quoteKey()`, senão uma nova; a migração `cotacoes` agrupou os antigos). open → closed (`closeGroup`: o
  síndico escolhe o contratado, aprovado na hora, ou encerra sem contratar com motivo; pode recusar os que aguardam)
  → arquivada (`archivedAt`, vai para o Histórico). `reopenGroup` só antes de arquivar. Regras puras `groupStats`,
  `groupSavings` (economia frente ao mais caro e à média) e `groupLabel` em `src/lib/suppliers.ts` (testadas).
  Quadro: Em andamento (as que esperam decisão primeiro) e Encerradas, com limite por coluna e "Ver todas" (`?ver=`);
  os números do topo abrem a lista de orçamentos com busca (`?status=`, `?q=`).
  **Relatório** (síndico e superadmin): `/fornecedores/relatorio` escolhe cotações e orçamentos (período pela criação
  da cotação, situação) → `/relatorio/orcamentos?ids=…` (ou `?grupo=`), A4 para "Salvar como PDF", com contratado,
  economia e motivos (`obs=0` tira); gerar fica na auditoria.
  Avisos `quote_created` (síndico) e `quote_decided` (quem cadastrou) em Mensagens; bloco "Orçamentos para aprovar"
  no painel do síndico. Entram no backup do condomínio (dados, cotações e arquivos em `orcamentos/`).
  Orçamento rápido na gaveta (`quick-quote.tsx`, `Sheet` da portaria; na cotação já vem com ela): soltar o PDF em
  qualquer lugar da página abre a gaveta; fornecedor buscado ou criado ali (`quickSupplier`, reaproveita o mesmo nome).
  Ícone e cor por ramo em `components/suppliers/look.tsx` (só cores do tema). Campos com vários botões usam
  `FieldGroup` (no `Field`, que é `<label>`, clicar no texto aciona o 1º botão).
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
- **Comunicados** (`/comunicados`): cartões em duas colunas no computador; o síndico publica pelo botão "Novo comunicado"
  do cabeçalho (gaveta `Sheet`). O superadmin vê os do condomínio em foco e só **pede** a exclusão (`AnnouncementChange`,
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
- **Reservas e portaria** (regras puras em `src/lib/booking.ts`, testadas; servidor em `booking-server.ts`; ações em
  `actions/bookings.ts` e `actions/portaria.ts`). Perfil **Porteiro** (`doorman`): o `/dashboard` manda para `/portaria`;
  não vê OS. Quem atende (`GATE_ROLES`: superadmin, síndico, zelador, porteiro) aprova/recusa reservas, cadastra
  visitantes e prestadores e registra entradas. Áreas reserváveis em Estrutura (horário que pode virar a noite,
  regras, capacidade = limite de convidados, "precisa de aprovação"). `Booking` pending → approved | rejected,
  cancelled; conflito de horário checado em transação serializável (pendentes também ocupam). Reserva feita por quem
  atende já sai aprovada. `/reservas`: calendário do mês (`booking-calendar.tsx`, `?mes=AAAA-MM`, cor por área em
  `AREA_COLORS`; morador vê as dos outros só como "Reservado") + painel do dia com "Reservar" →
  `/reservas/nova?area=&dia=`; abaixo, para aprovar e próximas.
  **Pessoas da portaria**: `AccessPerson` (uma por condomínio; `docKey` = documento normalizado identifica, então o
  morador que cadastra alguém já existente reaproveita o cadastro; `blockedAt` = entrada impedida) + `AccessGrant`
  (autorização: unidade ou condomínio quando `unitId` vazio; tipo resident/visitor/provider/delivery; dias da semana
  0=dom, horário, prazo). Regras puras `grantStatus()`/`expectedToday()`/`grantSchedule()` em `lib/booking.ts`;
  permissão `grantAccess()` em `booking-server.ts` (morador: só as unidades dele, e edita os dados da pessoa só se ela
  não estiver em outras unidades; porteiro/zelador: tudo menos morador; síndico/superadmin: tudo). Entrada
  (`AccessEntry`) tem vários destinos (`AccessEntryUnit`; `unitId` = o primeiro); cada destino é avisado e quem não
  estava autorizado hoje vem com o alerta `{aviso}` (linha própria no modelo `gate_entry`: no motor de mensagens, linha
  com variável vazia some). Ficha em `/portaria/pessoa/[id]`. `/minha-unidade`: só as autorizações das unidades do
  morador. `/portaria` é feita para ser rápida com centenas de unidades: **barra rápida** no topo (`QuickBar` em
  `components/portaria/quick.tsx`, fixa ao rolar, foco automático, "/" entra e Esc sai): unidade digitada ("502",
  "a502", "aurora 502"; regras em `src/lib/unit-search.ts`, testadas) abre o **cartão da unidade** (`?u=`,
  `portaria/unit-panel.tsx`: moradores com telefone, encomendas com "Entregar todas", autorizados com "Entrou",
  últimas entradas; divide em colunas por `@container`); nome vai para a busca (`?q=`). Abaixo, os 4 atalhos (no computador, em linha ao lado da busca; os números ficam na linha das abas)
  (`GateActions` em `components/portaria/gate-actions.tsx`: Encomenda R, Entrada E, Lote L, Pessoa P / Autorizar A,
  já com a unidade aberta; Esc fecha a unidade) abrem os formulários numa gaveta (`Sheet`: sobe de baixo no celular,
  janela no computador) e as fichas de números (`StatChips`). Aba Agora: no computador duas colunas (unidade, busca ou
  encomendas aguardando à esquerda; painel "Agora" fixo à direita); no celular o "Agora" vem primeiro.
  **Recebimento em lote** (`BatchReceive`, tecla L: transportadora e local fixos, unidade + Enter registra e avisa).
  Nunca use `<select>` com as unidades na portaria: use `UnitPicker` (`components/portaria/unit-picker.tsx`) ou
  `UnitFilter`. Busca de pessoas (só nomes, até 30), abas Agora ("Esperados hoje", "No condomínio agora" com Saiu, encomendas paradas, linha do tempo recolhida),
  Agenda (`portaria/agenda.tsx`: todos os contatos A–Z, letra calculada no banco sem acento, filtros de torre, tipo,
  situação e "moradores com conta", 50 por página) e Pessoas por unidade.
  **Encomendas** (aba Encomendas da Portaria, `portaria/parcels-tab.tsx`; `Parcel`; regras em `src/lib/parcels.ts`,
  ações em `actions/parcels.ts`): receber para a unidade (local de guarda com sugestões dos já usados; transportadora e
  local continuam preenchidos para registrar vários seguidos), dar baixa com quem retirou, devolver com motivo, trocar
  o local. Moradores da unidade recebem `parcel_received` (com o local) e `parcel_delivered`. Parada há 7 dias ou mais
  fica em destaque (`PARCEL_OVERDUE_DAYS`).
  Transportadoras e locais de guarda sugeridos são editáveis em Estrutura → Encomendas (síndico e superadmin;
  `Condominium.parcelCarriers`/`parcelLocations`, `saveParcelLists`). Lista vazia = padrão (`CARRIERS` e locais já
  usados); a portaria lê tudo por `parcelOptions()` (`lib/parcels-server.ts`). O morador vê as suas em Minha unidade e o total no início.
  Foto da etiqueta (`Parcel.photoUrl`, pasta `parcel-<id>`; a rota de mídias libera só para quem atende no condomínio e
  quem mora na unidade). Leitura automática no navegador do porteiro (sem custo, sem carga no servidor): a foto é
  reduzida (JPEG anexado) e limpa por `cleanForOcr()` (preto e branco Otsu, endireita até ±10° com `skewAngle()`, apaga
  código de barras e linhas longas: sem isso o tesseract.js lê lixo), o tesseract.js (`por`, baixado do CDN na
  primeira vez) extrai o texto e `parseLabel()` (`src/lib/parcel-label.ts`, testado) acha transportadora, rastreio,
  destinatário e unidade, cruzando com moradores com conta e cadastrados na portaria. O porteiro confere antes de salvar.
  Datas no fuso de Brasília (`brt()`/`brtParts()`).
- **Feed de serviços** (`/feed`, OS aprovadas): números do período (entregues, média da abertura à entrega, horas de
  trabalho, avaliação), filtros de período (`?periodo=30d|ano|tudo`, padrão o ano) e de categoria (`?cat=`), o mais
  recente com antes e depois em destaque e a grade por mês. Peças em `components/service-card.tsx`: `ServiceCard`
  (foto do depois, antes em miniatura, resumo), `FeaturedService` (destaque com `BeforeAfter`) e `ServiceShowcase`
  (destaque + cartões, usado em todos os painéis; no do síndico, do zelador e do superadmin é o bloco `delivered`, e no do superadmin sem condomínio em foco os cartões mostram o condomínio). Tudo por `@container`: se ajusta à largura de onde
  está, não da tela. No painel do morador, as categorias do ano viram botões que abrem o feed filtrado.
  Textos do resumo em `src/lib/feed.ts` (testado); `feed-card.tsx` guarda só a consulta `feedInclude`.
- **Fotos reduzidas**: listas e cartões usam `thumb(url, 480|800|1200)` (`src/lib/media-url.ts`) → `/api/media/...?w=`,
  que gera WebP com o sharp (`readThumb` em `storage.ts`) e guarda em `UPLOAD_DIR/_thumbs` (no disco). A visualização
  em tela cheia e o relatório usam a original.
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
