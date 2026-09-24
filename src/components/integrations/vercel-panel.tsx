import { ExternalLink, GitBranch, GitCommit, Globe } from "lucide-react";
import { vercelConfig, vercelOverview, type VercelDeployment } from "@/lib/vercel";
import { fmtDateTime, fmtDuration, fmtRelative, nowMs } from "@/lib/format";
import { Alert, Badge, Card, CardHeader, Stat, buttonClass, type Tone } from "@/components/ui";
import { RefreshButton } from "./refresh-button";

const STATE: Record<string, { label: string; tone: Tone }> = {
  READY: { label: "Pronto", tone: "ok" },
  BUILDING: { label: "Compilando", tone: "warn" },
  INITIALIZING: { label: "Iniciando", tone: "info" },
  QUEUED: { label: "Na fila", tone: "info" },
  ERROR: { label: "Erro", tone: "bad" },
  CANCELED: { label: "Cancelado", tone: "muted" },
};

const buildMinutes = (d: VercelDeployment) => (d.ready && d.buildingAt ? (d.ready - d.buildingAt) / 60000 : null);

export async function VercelPanel() {
  const c = await vercelConfig();
  if (!c.ready) return <Alert tone="muted">Informe o access token e o projeto acima para ver os deploys.</Alert>;

  let data: Awaited<ReturnType<typeof vercelOverview>>;
  try {
    data = await vercelOverview(c);
  } catch (e) {
    return <Alert>Não foi possível consultar a Vercel: {e instanceof Error ? e.message : String(e)}</Alert>;
  }
  const { project, deployments, domains, dashboardUrl } = data;
  const prod = deployments.find((d) => d.target === "production" && d.state === "READY");
  const week = deployments.filter((d) => d.created > nowMs() - 7 * 86400_000);
  const finished = deployments.filter((d) => d.state === "READY" || d.state === "ERROR");
  const success = finished.length ? Math.round((finished.filter((d) => d.state === "READY").length / finished.length) * 100) : null;
  const builds = deployments.map(buildMinutes).filter((x): x is number => x != null);
  const avgBuild = builds.length ? builds.reduce((a, b) => a + b, 0) / builds.length : null;
  const prodUrl = project.targets?.production?.alias?.[0] ?? prod?.url;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title={project.name}
          subtitle={[project.framework ?? "framework não detectado", project.nodeVersion && `Node ${project.nodeVersion}`].filter(Boolean).join(" · ")}
          action={
            <div className="flex gap-2">
              <RefreshButton />
              <a href={dashboardUrl} target="_blank" rel="noreferrer" className={buttonClass("outline", "sm")}>Abrir na Vercel <ExternalLink className="size-3" /></a>
            </div>
          }
        />
        <dl className="grid gap-4 p-5 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs text-muted">Produção</dt>
            <dd className="mt-1 truncate">{prodUrl ? <a href={`https://${prodUrl}`} target="_blank" rel="noreferrer" className="font-medium text-brand hover:underline">{prodUrl}</a> : "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Repositório</dt>
            <dd className="mt-1 flex items-center gap-1.5 truncate">
              {project.link?.repo ? <><GitBranch className="size-3.5 text-muted" />{project.link.org}/{project.link.repo} <span className="text-muted">({project.link.productionBranch ?? "main"})</span></> : "Sem Git conectado"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Último deploy em produção</dt>
            <dd className="mt-1">{prod ? `${fmtRelative(new Date(prod.created))} · ${prod.creator?.username ?? ""}` : "—"}</dd>
          </div>
        </dl>
        {domains.length > 0 && (
          <div className="flex flex-wrap gap-2 border-t border-line px-5 py-4">
            {domains.map((d) => (
              <span key={d.name} className="inline-flex items-center gap-1.5 rounded-lg bg-bg-2 px-2.5 py-1 text-xs">
                <Globe className="size-3 text-muted" />{d.name}
                {!d.verified && <Badge tone="warn">não verificado</Badge>}
                {d.redirect && <span className="text-muted">→ {d.redirect}</span>}
              </span>
            ))}
          </div>
        )}
      </Card>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Deploys (7 dias)" value={week.length} />
        <Stat label="Taxa de sucesso" value={success != null ? `${success}%` : "—"} tone={success != null && success < 80 ? "warn" : "ok"} hint={`últimos ${finished.length}`} />
        <Stat label="Tempo médio de build" value={avgBuild != null ? fmtDuration(avgBuild) : "—"} />
        <Stat label="Com erro" value={deployments.filter((d) => d.state === "ERROR").length} tone={deployments.some((d) => d.state === "ERROR") ? "bad" : undefined} hint={`de ${deployments.length}`} />
      </div>

      <Card className="overflow-x-auto">
        <CardHeader title="Histórico de deploys" subtitle={`${deployments.length} mais recentes`} />
        <table className="w-full min-w-[860px] text-sm">
          <thead className="border-b border-line text-left text-xs text-muted">
            <tr>
              <th className="px-5 py-3 font-medium">Status</th>
              <th className="px-5 py-3 font-medium">Ambiente</th>
              <th className="px-5 py-3 font-medium">Commit</th>
              <th className="px-5 py-3 font-medium">Autor</th>
              <th className="px-5 py-3 font-medium">Quando</th>
              <th className="px-5 py-3 font-medium">Build</th>
              <th />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {deployments.map((d) => {
              const st = STATE[d.state] ?? { label: d.state, tone: "muted" as Tone };
              const mins = buildMinutes(d);
              return (
                <tr key={d.uid} className="align-top">
                  <td className="px-5 py-3"><Badge tone={st.tone} dot>{st.label}</Badge></td>
                  <td className="px-5 py-3">{d.target === "production" ? <Badge tone="brand">Produção</Badge> : <span className="text-muted">Preview</span>}</td>
                  <td className="max-w-80 px-5 py-3">
                    {d.meta?.githubCommitMessage ? (
                      <>
                        <p className="truncate font-medium" title={d.meta.githubCommitMessage}>{d.meta.githubCommitMessage.split("\n")[0]}</p>
                        <p className="mt-0.5 flex items-center gap-1 text-xs text-muted">
                          <GitCommit className="size-3" />{d.meta.githubCommitSha?.slice(0, 7)} · {d.meta.githubCommitRef}
                        </p>
                      </>
                    ) : (
                      <span className="text-xs text-muted">{d.source === "cli" ? "Deploy via CLI" : d.source ?? "—"}</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-xs">{d.meta?.githubCommitAuthorName ?? d.creator?.username ?? "—"}</td>
                  <td className="whitespace-nowrap px-5 py-3 text-xs" title={fmtDateTime(new Date(d.created))}>{fmtRelative(new Date(d.created))}</td>
                  <td className="whitespace-nowrap px-5 py-3 font-num text-xs">{mins != null ? fmtDuration(mins) : "—"}</td>
                  <td className="whitespace-nowrap px-5 py-3 text-right text-xs">
                    {d.state === "READY" && <a href={`https://${d.url}`} target="_blank" rel="noreferrer" className="font-medium text-brand hover:underline">Visitar</a>}
                    {d.inspectorUrl && <a href={d.inspectorUrl} target="_blank" rel="noreferrer" className="ml-3 text-muted hover:text-fg">Logs</a>}
                  </td>
                </tr>
              );
            })}
            {!deployments.length && <tr><td colSpan={7} className="px-5 py-10 text-center text-muted">Nenhum deploy ainda.</td></tr>}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
