# Deploy no Coolify (servidor Hetzner)

Branch **`server`**. O Condtrack roda como imagem Docker (`Dockerfile` na raiz) no Coolify.
A Vercel continua funcionando em paralelo pela `main`: o `Dockerfile` e o
`output: "standalone"` não mudam nada lá.

Banco e mídias podem continuar no Neon e no Vercel Blob no começo, ou vir para o
servidor: veja as seções 4 (banco) e 5 (mídias).

Diferença em relação à Vercel: lá as migrações do Prisma rodam no `npm run build`;
aqui o build não tem banco, então elas rodam **quando o container sobe**
(`scripts/docker-start.sh` → `scripts/migrate.mjs` → `node server.js`).

---

## 1. App

1. **DNS:** registro `A` do domínio (ex.: `condtrack.kreativ.ae`) → IP do servidor.
2. Coolify › projeto › **+ New › Public/Private Repository** → `kreativae/condtrack`,
   branch **`server`**, **Build Pack: Dockerfile**, porta **3000**.
3. **Domains:** o domínio com `https://`.
4. **Environment Variables** (copie os valores da Vercel: `vercel env pull .env.coolify --yes`):

| Variável | Obrigatória | Observação |
|---|---|---|
| `DATABASE_URL` | sim | Neon (a mesma da Vercel) ou o Postgres do Coolify (seção 4) |
| `DATABASE_URL_UNPOOLED` | com Neon | conexão direta do Neon, para as migrações; no Postgres do Coolify não precisa |
| `AUTH_SECRET` | sim | **o mesmo da Vercel**: outro valor derruba as sessões e, sem `SETTINGS_ENCRYPTION_KEY`, as chaves salvas em Configurações deixam de abrir |
| `SETTINGS_ENCRYPTION_KEY` | se existir na Vercel | **o mesmo valor**, pelo mesmo motivo |
| `APP_URL` | sim | `https://condtrack.kreativ.ae` (retornos do Stripe, links dos e-mails) |
| `CRON_SECRET` | sim | segredo do agendador (seção 2) |
| `UPLOAD_DIR` | sim | `/app/storage`, com volume (seção 5) |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | para notificações | as mesmas da Vercel (outras chaves invalidam as inscrições dos celulares) |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | se existir na Vercel | marque **Is Build Variable** |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | reserva | o painel (Configurações) tem prioridade |
| `SETUP_TOKEN` | primeiro acesso | só se o banco estiver vazio |

   **Não** copie `BLOB_STORE_ID` nem `VERCEL_*`: o Blob no formato novo depende do
   login da Vercel (OIDC), que não existe fora dela. `SEED_ON_DEPLOY` também não
   funciona na imagem (o seed precisa do `tsx`).

   Variáveis `NEXT_PUBLIC_*` são gravadas na imagem no build: depois de mudar, **Redeploy**.
5. **Persistent Storage** › **+ Add** › **Volume**: destino `/app/storage`.
6. **Deploy**. O log mostra as migrações e depois o Next subindo.

## 2. Agendador (alerta de checklist e manutenção)

O alerta de checklist atrasado e a manutenção preventiva rodam por
`/api/cron/checklist` a cada 15 min. Hoje quem chama é o GitHub Actions
(`.github/workflows/checklist-atrasado.yml`) com a variable `APP_URL` do GitHub.

- **Opção A (mais simples):** no GitHub, `Settings › Secrets and variables › Actions`,
  troque a variable `APP_URL` para o domínio novo quando ele virar o oficial.
- **Opção B (no próprio servidor):** app › **Scheduled Tasks** › **+ Add**:
  - **Command:** `wget -qO- --header="Authorization: Bearer $CRON_SECRET" http://127.0.0.1:3000/api/cron/checklist`
  - **Frequency:** `*/15 * * * *`

  e apague a variable `APP_URL` do GitHub, para não rodar em dobro (o aviso é um por
  dia por condomínio, mas a manutenção também roda nessa chamada).

## 3. Trocar o domínio de produção

1. Teste tudo no domínio provisório.
2. Stripe: no painel do Stripe, **Webhooks**, cadastre
   `https://DOMINIO-NOVO/api/stripe/webhook` (o segredo muda: atualize em Configurações
   ou em `STRIPE_WEBHOOK_SECRET`).
3. **Passkeys (biometria)** ficam presas ao domínio: quem usava biometria no domínio
   antigo entra com senha e cadastra de novo em Meu perfil.
4. **Notificações no celular** também são por domínio: cada pessoa ativa de novo em Meu perfil.
5. Aponte o DNS e ajuste `APP_URL` (app e GitHub, seção 2).
6. Só depois de algumas semanas estável, desative o projeto na Vercel — **sem** remover
   a integração do Neon nem o Blob Store (podem apagar banco e arquivos).

## 4. Trazer o banco do Neon para o servidor

1. Coolify › projeto › **+ New › Database › PostgreSQL**. Imagem `postgres:17-alpine`,
   **Initial Database** `condtrack`. Não marque "Make it publicly available".
   Ative **Backups** (agendado, de preferência para um S3).
2. No servidor, rode [`deploy/migrate-neon.sh`](../deploy/migrate-neon.sh) (o cabeçalho
   tem o comando). Ele pede a URL **direta** do Neon (sem `-pooler`) e a
   **Postgres URL (internal)** do Coolify e copia tudo, inclusive o histórico das migrações.
   O Neon só é lido; pode repetir quantas vezes quiser (o destino é apagado a cada vez).
3. No app, troque `DATABASE_URL` pela URL interna do Coolify, apague
   `DATABASE_URL_UNPOOLED` e faça **Restart**.

Enquanto a Vercel estiver no ar ela continua gravando no Neon: faça a cópia final no
momento da troca de domínio, com a Vercel já desligada, para não perder dados.

## 5. Trazer as mídias do Vercel Blob para o servidor

Com `UPLOAD_DIR` definido, fotos e vídeos das OS, anexos do Financeiro, checklist e logos
são gravados e lidos do disco. Os endereços no banco são relativos (`/api/media/...`),
então nada muda no banco: só os arquivos precisam ser copiados.

1. Na Vercel, **Storage › Blob store › Settings**, gere um **Read/Write token**.
2. **Terminal** do app no Coolify:
   `BLOB_READ_WRITE_TOKEN=vercel_blob_rw_... node scripts/migrate-blob.mjs`
   Pode repetir: pula o que já foi copiado. Rode de novo no dia da troca de domínio.
3. Confira fotos das OS, anexos do Financeiro e logos.

Os arquivos ficam no volume: ative os **Backups** da Hetzner (cópia diária do servidor
inteiro) ou copie `/app/storage` para um S3.

## 6. Deploy automático a cada push

App › **Webhooks** › **Manual Git webhooks › GitHub**: copie a **Webhook URL**
(`.../webhooks/source/github/events/manual`) e gere o **Webhook secret**. No GitHub,
`Settings › Webhooks › Add webhook` com essa URL, `application/json`, o mesmo secret e
"Just the push event". Com **Auto Deploy** ligado (Advanced), cada push na `server`
dispara o deploy.

Use a URL da seção **GitHub** (`/source/github/`), não a de GitLab: com ela o GitHub
recebe 200, mas nada é publicado.

## Deploy mais rápido

- O `Dockerfile` guarda entre builds o cache do npm e o `.next/cache`; as dependências e a CLI do Prisma
  só são refeitas quando o `package-lock.json` muda.
- App › **Advanced** › **Watch Paths**: com a lista abaixo, push que mexe só em `docs/` ou `deploy/` não dispara deploy.

  ```
  src/**
  prisma/**
  public/**
  scripts/**
  package.json
  package-lock.json
  Dockerfile
  next.config.ts
  ```

## Commit em vigor (selo no canto inferior direito)

App › **General** (ou **Advanced**) › ligue **Include Source Commit in Build** e faça **Redeploy**.
Sem isso o selo mostra "local". Quem vê o selo é escolhido em Configurações → Aparência → Plataforma.

## Painéis Vercel e Neon em Configurações

Continuam funcionando enquanto houver token/API key, mas mostram a Vercel e o Neon,
não o servidor. Depois da migração completa, podem ser desligados.
