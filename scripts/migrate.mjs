// Aplica as migrações do Prisma no build (Vercel) e localmente.
// Se DATABASE_URL_UNPOOLED não existir (ex.: banco sem a integração Neon da
// Vercel), usa a própria DATABASE_URL para as migrações.
import { execSync } from "node:child_process";
import path from "node:path";

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
env.DATABASE_URL_UNPOOLED ||= env.DATABASE_URL;
if (!env.AUTH_SECRET) console.warn("⚠ AUTH_SECRET não definida — o login não vai funcionar até configurá-la.");

execSync("prisma migrate deploy", { stdio: "inherit", env });

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
