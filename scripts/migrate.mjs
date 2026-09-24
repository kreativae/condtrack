// Aplica as migrações do Prisma no build (Vercel) e localmente.
// Se DATABASE_URL_UNPOOLED não existir (ex.: banco sem a integração Neon da
// Vercel), usa a própria DATABASE_URL para as migrações.
import { execSync } from "node:child_process";
import path from "node:path";

function directUrl(url) {
  try {
    const u = new URL(url);
    u.hostname = u.hostname.replace("-pooler.", ".");
    u.searchParams.delete("pgbouncer");
    return u.toString();
  } catch {
    return url;
  }
}

const env = { ...process.env };
// Garante os binários locais (prisma, tsx) mesmo fora do `npm run`
env.PATH = `${path.resolve("node_modules/.bin")}${path.delimiter}${env.PATH ?? ""}`;
if (!env.DATABASE_URL) {
  console.error("✖ DATABASE_URL não definida. Configure o banco (Neon) nas variáveis de ambiente.");
  process.exit(1);
}
if (!env.DATABASE_URL.startsWith("postgres")) {
  console.error("✖ DATABASE_URL precisa ser uma URL PostgreSQL (postgres:// ou postgresql://).");
  process.exit(1);
}
// Migrações precisam de conexão DIRETA (usam advisory lock, que o pool/PgBouncer
// não mantém). No Neon, o host direto é o mesmo sem o sufixo "-pooler".
env.DATABASE_URL_UNPOOLED ||= directUrl(env.DATABASE_URL);
if (!env.AUTH_SECRET) console.warn("⚠ AUTH_SECRET não definida — o login não vai funcionar até configurá-la.");

/**
 * Uma conexão que ficou presa no pool (ex.: deploy que falhou) pode manter o
 * advisory lock do Prisma para sempre. Encerra só conexões OCIOSAS que seguram
 * essa trava — uma migração realmente em andamento (ativa) não é afetada.
 */
async function releaseStaleLock() {
  try {
    const { PrismaClient } = await import("@prisma/client");
    const db = new PrismaClient({ datasourceUrl: env.DATABASE_URL_UNPOOLED });
    const rows = await db.$queryRawUnsafe(`
      select pg_terminate_backend(a.pid) as ok
      from pg_locks l join pg_stat_activity a on a.pid = l.pid
      where l.locktype = 'advisory' and l.objid = ${PRISMA_LOCK_ID}
        and a.pid <> pg_backend_pid() and a.state <> 'active'`);
    await db.$disconnect();
    return rows.length;
  } catch (e) {
    console.warn("Não foi possível liberar a trava:", e.message);
    return 0;
  }
}

// ID fixo do advisory lock usado pelo `prisma migrate` (ver pris.ly/d/migrate-advisory-locking)
const PRISMA_LOCK_ID = 72707369;

// P1002 = timeout (ex.: dois deploys disputando a trava): tenta de novo
for (let attempt = 1; ; attempt++) {
  try {
    execSync("prisma migrate deploy", { stdio: "pipe", env }).toString().split("\n").forEach((l) => l && console.log(l));
    break;
  } catch (e) {
    const out = `${e.stdout ?? ""}${e.stderr ?? ""}`;
    console.error(out);
    if (!out.includes("P1002") || attempt >= 3) process.exit(1);
    const released = await releaseStaleLock();
    const wait = attempt * 10;
    console.warn(`⚠ Timeout nas migrações (P1002), tentativa ${attempt}/3 — ${released} conexão(ões) ociosa(s) com a trava encerrada(s); nova tentativa em ${wait}s…`);
    await new Promise((r) => setTimeout(r, wait * 1000));
  }
}

// Seed opcional no deploy: só roda com SEED_ON_DEPLOY=true e banco sem usuários
// (nunca apaga dados existentes). Remova a variável depois do primeiro deploy.
if (env.SEED_ON_DEPLOY === "true") {
  const { PrismaClient } = await import("@prisma/client");
  const db = new PrismaClient();
  const users = await db.user.count();
  await db.$disconnect();
  if (users === 0) {
    console.log("↻ Banco vazio e SEED_ON_DEPLOY=true — rodando o seed de demonstração…");
    execSync("tsx prisma/seed.ts", { stdio: "inherit", env });
  } else {
    console.log(`SEED_ON_DEPLOY ignorado: o banco já tem ${users} usuário(s).`);
  }
}
