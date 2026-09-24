import { Cpu, Database, ExternalLink, GitBranch, Server } from "lucide-react";
import { neonConfig, neonOverview } from "@/lib/neon";
import { fmtDateTime, fmtRelative } from "@/lib/format";
import { Alert, Badge, Card, CardHeader, Stat, buttonClass, cx, type Tone } from "@/components/ui";
import { RefreshButton } from "./refresh-button";

function bytes(n: number | null | undefined) {
  if (n == null) return "—";
  const u = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${u[i]}`;
}
const hours = (s: number | null | undefined) => (s == null ? "—" : `${(s / 3600).toFixed(1)} h`);

const COMPUTE: Record<string, { label: string; tone: Tone }> = {
  active: { label: "Ativo", tone: "ok" },
  idle: { label: "Suspenso", tone: "muted" },
  init: { label: "Iniciando", tone: "info" },
};
const CONN_STATE: Record<string, string> = { active: "Executando", idle: "Ociosa", "idle in transaction": "Ociosa em transação", sistema: "Processos do sistema" };
const OP_STATUS: Record<string, Tone> = { finished: "ok", running: "warn", scheduling: "info", failed: "bad", error: "bad", cancelled: "muted" };

export async function NeonPanel() {
  const c = await neonConfig();
  if (!c.ready) return <Alert tone="muted">Informe a API key e o ID do projeto acima para ver o banco.</Alert>;

  let data: Awaited<ReturnType<typeof neonOverview>>;
  try {
    data = await neonOverview(c);
  } catch (e) {
    return <Alert>Não foi possível consultar o Neon: {e instanceof Error ? e.message : String(e)}</Alert>;
  }
  const { project, branches, endpoints, operations, branch, databases, roles, live, liveError, consoleUrl } = data;
  const mainEndpoint = endpoints.find((e) => e.branch_id === branch?.id && e.type === "read_write") ?? endpoints[0];
  const usage = live ? Math.round((live.total / Math.max(1, live.maxConnections)) * 100) : null;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title={project.name}
          subtitle={`${project.region_id} · Postgres ${project.pg_version} · criado em ${fmtDateTime(project.created_at)}`}
          action={
            <div className="flex gap-2">
              <RefreshButton />
              <a href={consoleUrl} target="_blank" rel="noreferrer" className={buttonClass("outline", "sm")}>Abrir no Neon <ExternalLink className="size-3" /></a>
            </div>
          }
        />
        <div className="grid grid-cols-2 gap-4 p-5 lg:grid-cols-4">
          <Stat label="Conexões agora" value={live ? live.total : "—"} tone={usage != null && usage > 80 ? "bad" : "brand"} hint={live ? `de ${live.maxConnections} (${usage}%)` : "indisponível"} />
          <Stat label="Tamanho do banco" value={live ? bytes(live.sizeBytes) : bytes(branch?.logical_size)} hint={live ? `${live.tables} tabela(s)` : undefined} />
          <Stat label="Compute" value={mainEndpoint ? COMPUTE[mainEndpoint.current_state]?.label ?? mainEndpoint.current_state : "—"} tone={mainEndpoint?.current_state === "active" ? "ok" : undefined} hint={mainEndpoint?.last_active ? `ativo ${fmtRelative(mainEndpoint.last_active)}` : undefined} />
          <Stat label="Compute no período" value={hours(project.compute_time_seconds)} hint={`CPU ${hours(project.cpu_used_sec)} · armazenamento ${bytes(project.synthetic_storage_size)}`} />
        </div>
      </Card>

      {/* Conexões reais (pg_stat_activity) */}
      <Card>
        <CardHeader title="Conexões ativas" subtitle={live ? `Lidas agora do banco ${c.databaseName} (${live.version})` : "Consulta direta ao banco"} />
        {live ? (
          <div className="grid gap-6 p-5 lg:grid-cols-[1fr_1fr_1.6fr]">
            <div>
              <p className="mb-3 text-[13px] font-semibold">Por estado</p>
              <ul className="space-y-2 text-sm">
                {live.byState.map((s) => (
                  <li key={s.state} className="flex items-center justify-between gap-3">
                    <span className="text-fg-2">{CONN_STATE[s.state] ?? s.state}</span>
                    <span className="font-num font-semibold">{s.count}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-bg-2" title={`${usage}% do limite`}>
                <div className={cx("h-full rounded-full", usage! > 80 ? "bg-bad" : "bg-brand")} style={{ width: `${Math.min(100, usage!)}%` }} />
              </div>
              <p className="mt-1.5 text-xs text-muted">{live.total} de {live.maxConnections} permitidas</p>
            </div>
            <div>
              <p className="mb-3 text-[13px] font-semibold">Por aplicação</p>
              <ul className="space-y-2 text-sm">
                {live.byApp.map((a) => (
                  <li key={a.application} className="flex items-center justify-between gap-3">
                    <span className="truncate text-fg-2">{a.application}</span>
                    <span className="font-num font-semibold">{a.count}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="min-w-0">
              <p className="mb-3 text-[13px] font-semibold">Sessões mais longas</p>
              {live.longest.length ? (
                <ul className="divide-y divide-line rounded-xl border border-line text-xs">
                  {live.longest.map((s) => (
                    <li key={s.pid} className="px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">{s.user} · {s.application}</span>
                        <span className="font-num text-muted">{s.seconds >= 3600 ? `${Math.floor(s.seconds / 3600)}h` : s.seconds >= 60 ? `${Math.floor(s.seconds / 60)}min` : `${s.seconds}s`} · {CONN_STATE[s.state] ?? (s.state || "—")}</span>
                      </div>
                      {s.query && <p className="mt-0.5 truncate font-mono text-[11px] text-muted" title={s.query}>{s.query}</p>}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted">Nenhuma outra sessão aberta além desta consulta.</p>
              )}
            </div>
          </div>
        ) : (
          <div className="p-5"><Alert tone="warn">Não foi possível ler as conexões: {liveError}</Alert></div>
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Computes" subtitle={`${endpoints.length} endpoint(s)`} />
          <ul className="divide-y divide-line">
            {endpoints.map((e) => {
              const st = COMPUTE[e.current_state] ?? { label: e.current_state, tone: "muted" as Tone };
              return (
                <li key={e.id} className="flex items-start gap-3 px-5 py-4 text-sm">
                  <Server className="mt-0.5 size-4 text-muted" />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 font-medium">{e.type === "read_write" ? "Leitura e escrita" : "Somente leitura"} <Badge tone={st.tone} dot>{st.label}</Badge></p>
                    <p className="truncate font-mono text-xs text-muted">{e.host}</p>
                    <p className="mt-1 text-xs text-muted">
                      {e.autoscaling_limit_min_cu}–{e.autoscaling_limit_max_cu} CU · suspende após {e.suspend_timeout_seconds ? `${e.suspend_timeout_seconds}s` : "padrão"}
                      {e.pooler_enabled ? " · pooler ativo" : ""}
                      {e.last_active ? ` · último uso ${fmtRelative(e.last_active)}` : ""}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
        <Card>
          <CardHeader title="Branches" subtitle={branch ? `Em uso: ${branch.name}` : undefined} />
          <ul className="divide-y divide-line">
            {branches.map((b) => (
              <li key={b.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                <GitBranch className="size-4 text-muted" />
                <span className="flex-1 truncate font-medium">{b.name}</span>
                {(b.default || b.primary) && <Badge tone="brand">padrão</Badge>}
                <span className="font-num text-xs text-muted">{bytes(b.logical_size)}</span>
              </li>
            ))}
          </ul>
          <div className="grid gap-4 border-t border-line p-5 text-sm sm:grid-cols-2">
            <div>
              <p className="mb-2 flex items-center gap-1.5 text-xs text-muted"><Database className="size-3.5" />Bancos</p>
              <p>{databases.map((d) => d.name).join(", ") || "—"}</p>
            </div>
            <div>
              <p className="mb-2 flex items-center gap-1.5 text-xs text-muted"><Cpu className="size-3.5" />Roles</p>
              <p>{roles.map((r) => r.name).join(", ") || "—"}</p>
            </div>
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title="Operações recentes" />
        <ul className="divide-y divide-line">
          {operations.map((o) => (
            <li key={o.id} className="flex items-center gap-3 px-5 py-3 text-sm">
              <Badge tone={OP_STATUS[o.status] ?? "muted"}>{o.status}</Badge>
              <span className="flex-1 font-mono text-xs">{o.action}</span>
              {o.total_duration_ms != null && <span className="font-num text-xs text-muted">{(o.total_duration_ms / 1000).toFixed(1)}s</span>}
              <span className="text-xs text-muted" title={fmtDateTime(o.created_at)}>{fmtRelative(o.created_at)}</span>
            </li>
          ))}
          {!operations.length && <li className="px-5 py-8 text-center text-sm text-muted">Sem operações recentes.</li>}
        </ul>
      </Card>
    </div>
  );
}
