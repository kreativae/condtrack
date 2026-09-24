import "server-only";
import { neon } from "@neondatabase/serverless";
import { getSettings, type SettingsValues } from "./settings";

const API = "https://console.neon.tech/api/v2";

export type NeonConfig = { apiKey: string; projectId: string; branchId: string; databaseName: string; roleName: string };

export async function neonConfig(overrides?: SettingsValues): Promise<NeonConfig & { ready: boolean }> {
  const s = { ...(await getSettings("neon")), ...overrides };
  const c = {
    apiKey: String(s.apiKey ?? ""),
    projectId: String(s.projectId ?? ""),
    branchId: String(s.branchId ?? ""),
    databaseName: String(s.databaseName || "neondb"),
    roleName: String(s.roleName ?? ""),
  };
  return { ...c, ready: !!c.apiKey && !!c.projectId };
}

async function call<T>(c: NeonConfig, path: string, params: Record<string, string | undefined> = {}): Promise<T> {
  const url = new URL(API + path);
  for (const [k, v] of Object.entries(params)) if (v) url.searchParams.set(k, v);
  const res = await fetch(url, { headers: { Authorization: `Bearer ${c.apiKey}`, Accept: "application/json" }, cache: "no-store" });
  const body = (await res.json().catch(() => ({}))) as { message?: string };
  if (!res.ok) {
    throw new Error(res.status === 401 ? "API key inválida." : res.status === 404 ? "Projeto não encontrado para esta API key." : body.message ?? `Neon respondeu ${res.status}`);
  }
  return body as T;
}

export type NeonProject = {
  id: string;
  name: string;
  region_id: string;
  pg_version: number;
  created_at: string;
  platform_id?: string;
  cpu_used_sec?: number;
  active_time_seconds?: number;
  compute_time_seconds?: number;
  written_data_bytes?: number;
  data_transfer_bytes?: number;
  synthetic_storage_size?: number;
  consumption_period_start?: string;
  consumption_period_end?: string;
};
export type NeonBranch = { id: string; name: string; default?: boolean; primary?: boolean; current_state?: string; logical_size?: number; created_at: string; parent_id?: string };
export type NeonEndpoint = {
  id: string;
  host: string;
  branch_id: string;
  type: string;
  current_state: string;
  autoscaling_limit_min_cu?: number;
  autoscaling_limit_max_cu?: number;
  suspend_timeout_seconds?: number;
  last_active?: string;
  pooler_enabled?: boolean;
  region_id?: string;
};
export type NeonOperation = { id: string; action: string; status: string; created_at: string; total_duration_ms?: number; branch_id?: string };
type NeonDatabase = { id: number; name: string; owner_name: string };
type NeonRole = { name: string; protected?: boolean };

export type LiveStats = {
  version: string;
  sizeBytes: number;
  maxConnections: number;
  total: number;
  byState: { state: string; count: number }[];
  byApp: { application: string; count: number }[];
  longest: { pid: number; user: string; state: string; application: string; seconds: number; query: string }[];
  tables: number;
};

/** Consulta o próprio banco: conexões ativas (pg_stat_activity), tamanho e versão. */
async function liveStats(uri: string): Promise<LiveStats> {
  const sql = neon(uri);
  const [[meta], states, apps, longest, [tables]] = await Promise.all([
    sql`select version() as version, pg_database_size(current_database())::bigint as size, current_setting('max_connections')::int as max_connections`,
    sql`select coalesce(state, 'sistema') as state, count(*)::int as count from pg_stat_activity where datname = current_database() group by 1 order by 2 desc`,
    sql`select coalesce(nullif(application_name, ''), '(sem nome)') as application, count(*)::int as count from pg_stat_activity where datname = current_database() group by 1 order by 2 desc limit 8`,
    sql`select pid, usename as user, coalesce(state,'') as state, coalesce(nullif(application_name,''),'(sem nome)') as application,
               extract(epoch from (now() - coalesce(query_start, backend_start)))::int as seconds, left(query, 140) as query
        from pg_stat_activity where datname = current_database() and pid <> pg_backend_pid()
        order by coalesce(query_start, backend_start) asc nulls last limit 8`,
    sql`select count(*)::int as n from information_schema.tables where table_schema not in ('pg_catalog','information_schema')`,
  ]);
  const byState = states.map((r) => ({ state: String(r.state), count: Number(r.count) }));
  return {
    version: String(meta.version).split(" on ")[0],
    sizeBytes: Number(meta.size),
    maxConnections: Number(meta.max_connections),
    total: byState.reduce((a, b) => a + b.count, 0),
    byState,
    byApp: apps.map((r) => ({ application: String(r.application), count: Number(r.count) })),
    longest: longest.map((r) => ({ pid: Number(r.pid), user: String(r.user), state: String(r.state), application: String(r.application), seconds: Number(r.seconds), query: String(r.query ?? "") })),
    tables: Number(tables.n),
  };
}

export async function neonOverview(c: NeonConfig) {
  const p = encodeURIComponent(c.projectId);
  const [{ project }, { branches }, { endpoints }, { operations }] = await Promise.all([
    call<{ project: NeonProject }>(c, `/projects/${p}`),
    call<{ branches: NeonBranch[] }>(c, `/projects/${p}/branches`),
    call<{ endpoints: NeonEndpoint[] }>(c, `/projects/${p}/endpoints`),
    call<{ operations: NeonOperation[] }>(c, `/projects/${p}/operations`, { limit: "12" }).catch(() => ({ operations: [] as NeonOperation[] })),
  ]);
  const branch = branches.find((b) => b.id === c.branchId) ?? branches.find((b) => b.default || b.primary) ?? branches[0];
  const [databases, roles] = branch
    ? await Promise.all([
        call<{ databases: NeonDatabase[] }>(c, `/projects/${p}/branches/${branch.id}/databases`).then((r) => r.databases).catch(() => [] as NeonDatabase[]),
        call<{ roles: NeonRole[] }>(c, `/projects/${p}/branches/${branch.id}/roles`).then((r) => r.roles).catch(() => [] as NeonRole[]),
      ])
    : [[], []];

  // Conexões reais: pede a connection string à API e consulta o banco
  let live: LiveStats | null = null;
  let liveError: string | null = null;
  if (branch) {
    const db = databases.find((d) => d.name === c.databaseName) ?? databases[0];
    const role = c.roleName || db?.owner_name;
    if (db && role) {
      try {
        const { uri } = await call<{ uri: string }>(c, `/projects/${p}/connection_uri`, { branch_id: branch.id, database_name: db.name, role_name: role, pooled: "false" });
        live = await liveStats(uri);
      } catch (e) {
        liveError = e instanceof Error ? e.message : String(e);
      }
    } else liveError = "Nenhum banco/role encontrado nesta branch.";
  }

  return { project, branches, endpoints, operations, branch, databases, roles, live, liveError, consoleUrl: `https://console.neon.tech/app/projects/${c.projectId}` };
}

export async function neonTest(c: NeonConfig) {
  const { project } = await call<{ project: NeonProject }>(c, `/projects/${encodeURIComponent(c.projectId)}`);
  return { name: project.name, region: project.region_id, pg: project.pg_version };
}
