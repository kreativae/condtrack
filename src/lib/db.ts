import { PrismaClient } from "@prisma/client";

// directUrl só é usado pelas migrações; evita erro se a variável não existir
process.env.DATABASE_URL_UNPOOLED ||= process.env.DATABASE_URL;

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
