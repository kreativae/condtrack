import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { EditUserPage } from "@/components/admin/edit-user-page";

export const metadata: Metadata = { title: "Editar usuário" };

export default async function Page({ params }: PageProps<"/usuarios/[id]/editar">) {
  const me = await requireUser("syndic");
  return <EditUserPage me={me} id={(await params).id} back="/usuarios" />;
}
