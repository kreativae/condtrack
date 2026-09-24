# Condtrack · Gestão Condominial

Plataforma de gestão condominial com transparência total: ordens de serviço com registro visual
de **antes e depois**, validação do zelador, aprovação do síndico e feed público para moradores.

> **Status:** MVP da Fase 1 (núcleo de OS, dashboards, feed, usuários, multi-condomínio, auditoria).

## Rodando localmente

Banco: **PostgreSQL no Neon**, provisionado pela integração Neon do Vercel Marketplace
(projeto Vercel `kreativae-projetos/condtrack`).

```bash
npm install
vercel env pull .env.local --yes   # traz DATABASE_URL / DATABASE_URL_UNPOOLED do Neon
npm run db:migrate                 # aplica prisma/migrations
npm run db:seed                    # dados de demonstração
npm run dev                        # http://localhost:3000
```

Os scripts `db:*` leem `.env.local` e `.env` (via dotenv-cli), porque o Prisma CLI não lê `.env.local`.
Alterou o schema? `npm run db:migrate:dev -- --name descricao` cria uma nova migração.
No deploy, `npm run build` roda `prisma migrate deploy` antes do `next build`.

### Deploy na Vercel

Variáveis de ambiente do projeto:

| Variável | Obrigatória | Observação |
|---|---|---|
| `DATABASE_URL` | sim | PostgreSQL (Neon). A integração Neon da Vercel cria automaticamente. |
| `DATABASE_URL_UNPOOLED` | não | Conexão direta para migrações; se ausente, usa `DATABASE_URL`. |
| `AUTH_SECRET` | sim | `openssl rand -base64 32`. Sem ela o login não funciona. |
| `SEED_ON_DEPLOY` | não | `true` roda o seed de demonstração **apenas se o banco estiver sem usuários**. Remova após o primeiro deploy. |

O build (`npm run build`) aplica as migrações pendentes via `scripts/migrate.mjs`.

Contas de demonstração (senha `condtrack123`):

| Perfil | E-mail |
|---|---|
| Superadmin | admin@condtrack.app |
| Síndico | sindico@condtrack.app |
| Zelador | zelador@condtrack.app |
| Prestador (pintura) | prestador@condtrack.app |
| Prestador (elétrica) | eletrica@condtrack.app |
| Conselho | conselho@condtrack.app |
| Morador (somente visualização) | morador@condtrack.app |


## Perfis

| Perfil | Código | O que faz |
|---|---|---|
| Superadmin | `superadmin` | Tudo, em todos os condomínios |
| Síndico | `syndic` | Gestão completa do condomínio, atribui e aprova OS |
| Zelador | `caretaker` | Registra ocorrências e valida serviços |
| Prestador | `provider` | Executa OS atribuídas, anexa antes/depois |
| Conselho | `council` | Abre solicitações, acompanha as suas, comunicados e feed |
| Morador | `resident` | **Somente visualização**: dashboard e feed de serviços entregues |

## Stack

Next.js 16 (App Router, Server Actions, `proxy.ts`) · React 19 · Tailwind CSS 4 · Prisma 6 + PostgreSQL (Neon) ·
Zod · jose (JWT em cookie httpOnly) · bcryptjs · Recharts · Lucide.

## Fluxo da OS

```
open ─► assigned ─► in_progress ─► completed ─► validated ─► approved (feed)
         (síndico)   (prestador,    (prestador,   (zelador)    (síndico)
                      exige ANTES)   exige DEPOIS)
                                        │              │
                                        └── rejected ◄─┘  (devolvida com motivo → prestador retoma)
```

Todas as regras de transição e visibilidade ficam em **`src/lib/workflow.ts`** (`can()` / `canView()`),
usadas tanto pela UI quanto pelas server actions — a UI nunca é a única barreira.

## Estrutura

```
prisma/schema.prisma        modelo de dados (Condomínio, Torre, Unidade, Usuário, OS, Mídia, Evento, …)
prisma/seed.ts              dados de demonstração
src/proxy.ts                redireciona não autenticados (checagem otimista)
src/lib/auth.ts             sessão, requireUser(), "visualizar como" (impersonate)
src/lib/workflow.ts         máquina de estados da OS + permissões por papel
src/lib/notify.ts           notificações in-app (ponto de extensão p/ push/e-mail)
src/lib/audit.ts            log de auditoria (IP, user-agent, antes/depois)
src/lib/storage.ts          armazenamento de mídia (local → trocar por R2/Blob)
src/app/actions/*           server actions (auth, OS, admin, comunicados)
src/app/api/upload          upload de mídia (1 arquivo/req, com checagem de permissão)
src/app/api/media           entrega de mídia autenticada
src/app/(app)/…             páginas autenticadas por perfil
src/components/             design system (ui.tsx), slider antes/depois, uploader, gráficos
```

## O que já está implementado

- **Autenticação**: e-mail + senha (bcrypt), sessão JWT httpOnly de 12h, bloqueio após 5 tentativas (15 min), RBAC em todas as páginas/ações.
- **OS (core)**: protocolo automático, categorias, prioridade com SLA, área comum ou unidade, fotos da ocorrência, atribuição com prazo, timeline, comentários, materiais, tempo de execução, validação, aprovação/rejeição com motivo, cancelamento, avaliação do solicitante.
- **Registro visual**: até 10 arquivos por etapa, vídeos até 2 min, compressão client-side (máx. 1920px, JPEG 82%), **marca d'água automática** com data/hora/protocolo/local/geolocalização, slider antes/depois, lightbox.
- **Dashboards** por perfil: superadmin (global, ranking de eficiência, atrasos), síndico (status, categorias, áreas, prestadores, pendências), zelador (validações, urgências, checklist diário), prestador (fila de trabalho), morador (feed, solicitações, comunicados).
- **Feed transparente** de serviços aprovados (quem executou, quem validou, quem aprovou).
- **Usuários**: cadastro por perfil com senha provisória, vínculo a unidade, ativar/desativar, reset de senha.
- **Multi-condomínio**: criar/editar condomínio com estrutura (torres × andares × unidades), categorias e áreas padrão, cor de destaque.
- **Comunicados** com categorias, notificação e confirmação de leitura.
- **Notificações in-app** conforme a matriz do escopo.
- **Auditoria**: todas as ações críticas, inclusive ações feitas em modo "visualizar como".
- **Design**: light mode padrão + dark mode, Plus Jakarta Sans + Inter, paleta neutra com acento indigo, responsivo com navegação inferior no mobile, PWA manifest.

## Assinaturas (Stripe)

Cobrança recorrente por condomínio, em BRL, via Stripe (integração do Vercel Marketplace).

- **Planos**: Essencial (até 100 unid., R$ 150), Profissional (até 150, R$ 200), Premium (ilimitado, R$ 400). Anual = 11× o mensal. 14 dias de teste na primeira assinatura. Editáveis em *Assinaturas → Planos*; produtos/preços são criados no Stripe automaticamente (`lookup_key` `condtrack_<plano>_<month|year>`).
- **Síndico** (`/assinatura`): assinar via Stripe Checkout, trocar de plano/periodicidade (com proration), cancelar no fim do período ou reativar, trocar cartão e dados de cobrança no Portal do Cliente, histórico de faturas com PDF.
- **Superadmin** (`/admin/assinaturas`): MRR, ARR, recebido em 30 dias, pagantes / em teste / inadimplentes / cancelados, receita mensal, condomínios por plano, lista completa com último pagamento e próxima cobrança; detalhe por condomínio com troca de plano, cancelamento e link para o Stripe.
- **Webhook** `/api/stripe/webhook` (idempotente). Eventos: `checkout.session.completed`, `customer.subscription.created|updated|deleted|trial_will_end`, `invoice.finalized|paid|payment_failed|voided|marked_uncollectible`. Falha de pagamento notifica síndico e superadmins.
- Sem webhook (ex.: dev local) o sistema sincroniza direto pela API no retorno do checkout e nos botões "Sincronizar".

Em dev, para receber webhooks: `stripe listen --forward-to localhost:3000/api/stripe/webhook` e use o segredo exibido em `STRIPE_WEBHOOK_SECRET`.

## Configurações (superadmin)

`/admin/configuracoes` centraliza as APIs da plataforma. Valores ficam na tabela `Setting`, cifrados com AES-256-GCM (`SETTINGS_ENCRYPTION_KEY` ou derivado do `AUTH_SECRET`). Ordem de leitura: valor salvo → variável de ambiente → padrão.

- **Stripe** — ambiente (teste/produção), chave publicável, chave secreta, segredo do webhook; botão "Testar conexão"; URL do webhook e eventos a assinar.
- **E-mail** — Resend (API) ou SMTP; remetente, responder-para, botão "Enviar e-mail de teste" (usa o que está no formulário, mesmo sem salvar). Quando ativo: notificações do sistema também por e-mail (enviadas após a resposta, via `after()`), e convite/redefinição de senha com a senha provisória.
- **Vercel** — access token, time e projeto. Painel com projeto, domínios, produção atual, indicadores (deploys em 7 dias, taxa de sucesso, tempo médio de build) e histórico de deploys com commit, autor e links de logs.
- **Neon** — API key e projeto. Painel com computes (ativo/suspenso, CU, último uso), branches, bancos, roles, uso do período, operações recentes e **conexões reais**: o sistema obtém a connection string pela API e consulta `pg_stat_activity` (por estado, por aplicação, sessões mais longas, uso vs. `max_connections`).
- **Segurança** — tentativas de login antes do bloqueio, tempo de bloqueio, duração da sessão, Cloudflare Turnstile (anti-robô) no login.
- **Face ID e biometria** — passkeys/WebAuthn (`@simplewebauthn`): ativar/desativar, nome exibido, domínio (RP ID) e origens. Cada usuário cadastra aparelhos em *Meu perfil*; o login mostra "Entrar com Face ID / biometria". Exige HTTPS em produção.

## Próximos passos (roadmap do escopo)

| Item | Observação |
|---|---|
| Armazenamento de mídia | Implementar `saveFile/readStored` com R2 ou Vercel Blob (URLs assinadas). O disco local não persiste em serverless. |
| 2FA síndico/superadmin | Fase 1 restante. |
| Push / e-mail / WhatsApp | Plugar em `src/lib/notify.ts`. |
| Fase 2 | Documentos, reservas de áreas comuns, chat, inspeções/rondas persistidas, manutenção preventiva, relatórios PDF/Excel. |
| Fase 3 | App mobile (Expo), modo offline. |
| Logo por condomínio | Hoje só a cor de destaque é configurável. |
| Testes E2E | Playwright cobrindo o fluxo completo da OS. |
