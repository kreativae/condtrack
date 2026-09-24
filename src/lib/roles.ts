export const ROLES = ["superadmin", "syndic", "caretaker", "provider", "council", "resident"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABEL: Record<Role, string> = {
  superadmin: "Superadministrador",
  syndic: "Síndico",
  caretaker: "Zelador",
  provider: "Prestador",
  council: "Conselho",
  resident: "Morador",
};

/** Quem cada papel pode cadastrar. */
export const MANAGEABLE_ROLES: Record<Role, Role[]> = {
  superadmin: ["superadmin", "syndic", "caretaker", "provider", "council", "resident"],
  syndic: ["caretaker", "provider", "council", "resident"],
  caretaker: [],
  provider: [],
  council: [],
  resident: [],
};

export function isRole(v: string): v is Role {
  return (ROLES as readonly string[]).includes(v);
}
