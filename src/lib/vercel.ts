import "server-only";
import { getSettings, type SettingsValues } from "./settings";

const API = "https://api.vercel.com";

export type VercelConfig = { token: string; teamId: string; projectId: string };

export async function vercelConfig(overrides?: SettingsValues): Promise<VercelConfig & { ready: boolean }> {
  const s = { ...(await getSettings("vercel")), ...overrides };
  const c = { token: String(s.token ?? ""), teamId: String(s.teamId ?? ""), projectId: String(s.projectId ?? "") };
  return { ...c, ready: !!c.token && !!c.projectId };
}

class VercelError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function call<T>(c: VercelConfig, path: string, params: Record<string, string | number | undefined> = {}): Promise<T> {
  const url = new URL(API + path);
  // teamId aceita ID (team_…) ou slug
  if (c.teamId) url.searchParams.set(c.teamId.startsWith("team_") ? "teamId" : "slug", c.teamId);
  for (const [k, v] of Object.entries(params)) if (v !== undefined) url.searchParams.set(k, String(v));
  const res = await fetch(url, { headers: { Authorization: `Bearer ${c.token}` }, cache: "no-store" });
  const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
  if (!res.ok) {
    const msg = res.status === 401 || res.status === 403 ? "Token inválido ou sem acesso a este time/projeto." : res.status === 404 ? "Projeto ou time não encontrado." : body.error?.message ?? `Vercel respondeu ${res.status}`;
    throw new VercelError(res.status, msg);
  }
  return body as T;
}

export type VercelDeployment = {
  uid: string;
  name: string;
  url: string;
  created: number;
  state: "BUILDING" | "ERROR" | "INITIALIZING" | "QUEUED" | "READY" | "CANCELED" | string;
  target?: "production" | "staging" | null;
  ready?: number;
  buildingAt?: number;
  inspectorUrl?: string;
  creator?: { username?: string; email?: string };
  source?: string;
  meta?: { githubCommitMessage?: string; githubCommitRef?: string; githubCommitSha?: string; githubCommitAuthorName?: string; githubRepo?: string; githubOrg?: string };
};

type Project = {
  id: string;
  name: string;
  framework?: string | null;
  nodeVersion?: string;
  createdAt: number;
  updatedAt?: number;
  link?: { type?: string; org?: string; repo?: string; productionBranch?: string };
  targets?: { production?: VercelDeployment & { alias?: string[] } };
};

type Domain = { name: string; verified: boolean; redirect?: string | null; gitBranch?: string | null };

export async function vercelOverview(c: VercelConfig, limit = 25) {
  const [project, deployments, domains] = await Promise.all([
    call<Project>(c, `/v9/projects/${encodeURIComponent(c.projectId)}`),
    call<{ deployments: VercelDeployment[] }>(c, "/v6/deployments", { projectId: c.projectId, limit }),
    call<{ domains: Domain[] }>(c, `/v9/projects/${encodeURIComponent(c.projectId)}/domains`).catch(() => ({ domains: [] as Domain[] })),
  ]);
  const teamSlug = c.teamId && !c.teamId.startsWith("team_") ? c.teamId : null;
  return { project, deployments: deployments.deployments, domains: domains.domains, dashboardUrl: teamSlug ? `https://vercel.com/${teamSlug}/${project.name}` : "https://vercel.com/dashboard" };
}

/** Valida o token e o projeto (usado no botão "Testar conexão"). */
export async function vercelTest(c: VercelConfig) {
  const user = await call<{ user: { username: string; email?: string } }>({ ...c, teamId: "" }, "/v2/user");
  const project = c.projectId ? await call<Project>(c, `/v9/projects/${encodeURIComponent(c.projectId)}`) : null;
  return { user: user.user.username, project: project?.name ?? null };
}
