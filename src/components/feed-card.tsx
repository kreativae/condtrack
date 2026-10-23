import type { Prisma } from "@prisma/client";

// O que o feed de serviços busca de cada OS aprovada (o cartão fica em service-card.tsx).

export const feedInclude = {
  condominium: { select: { name: true } },
  category: true,
  commonArea: true,
  unit: { include: { building: true } },
  assignedTo: { select: { name: true, company: true } },
  validatedBy: { select: { name: true } },
  approvedBy: { select: { name: true } },
  media: { where: { phase: { in: ["opening", "before", "after"] } }, orderBy: { uploadedAt: "asc" } },
} satisfies Prisma.ServiceOrderInclude;

export type FeedItem = Prisma.ServiceOrderGetPayload<{ include: typeof feedInclude }>;
