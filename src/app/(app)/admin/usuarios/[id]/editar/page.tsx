import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { EditUserPage } from "@/components/admin/edit-user-page";

export const metadata: Metadata = { title: "Editar usuário" };

export default async function Page({ params }: PageProps<"/admin/usuarios/[id]/editar">) {
  const me = await requireUser("superadmin");
  return <EditUserPage me={me} id={(await params).id} back="/admin/usuarios" />;
}
