// Permissões extras que o superadmin concede (ou não) a cada síndico em Editar usuário.
// O superadmin tem todas. Seguro para client e server.

export const SYNDIC_PERMISSIONS = {
  checklist_edit: {
    label: "Editar o checklist",
    hint: "Corrigir quem fez e o horário das conferências, conferir dias anteriores e editar anotações.",
  },
  audit: {
    label: "Ver a auditoria do condomínio",
    hint: "Item Auditoria no menu, com as ações registradas no condomínio dele.",
  },
} as const;

export type Permission = keyof typeof SYNDIC_PERMISSIONS;
export const PERMISSION_KEYS = Object.keys(SYNDIC_PERMISSIONS) as Permission[];

export function hasPermission(user: { role: string; permissions: string }, p: Permission) {
  if (user.role === "superadmin") return true;
  return user.role === "syndic" && user.permissions.split(",").includes(p);
}
