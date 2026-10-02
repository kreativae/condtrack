"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { createDemoCondominium } from "@/lib/demo-condo";

/** Síndico de demonstração que recebe o vínculo com o condomínio fictício. */
const DEMO_SYNDIC = "sindico@condtrack.app";

export async function createDemoCondo() {
  const me = await requireUser("superadmin");
  const condo = await createDemoCondominium({ syndicEmail: DEMO_SYNDIC });
  await audit(me, "create", "condominium", condo.id, { new: { name: condo.name, demo: true, syndic: DEMO_SYNDIC }, condominiumId: condo.id });
  revalidatePath("/admin/condominios");
  redirect(`/admin/condominios/${condo.id}`);
}
