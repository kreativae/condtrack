import { GitCommitHorizontal } from "lucide-react";

/** Repositório do commit: o da Vercel, GIT_REPO ("dono/repo") ou este projeto */
function repoSlug() {
  const { VERCEL_GIT_REPO_OWNER: owner, VERCEL_GIT_REPO_SLUG: slug, GIT_REPO } = process.env;
  if (owner && slug) return `${owner}/${slug}`;
  return GIT_REPO?.trim() || "kreativae/condtrack";
}

/** Título do commit: a Vercel envia; no Coolify vem do GitHub (cache de 1 dia por commit) */
async function commitMessage(repo: string, sha: string) {
  const fromVercel = process.env.VERCEL_GIT_COMMIT_MESSAGE;
  if (fromVercel) return fromVercel.split("\n")[0];
  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/commits/${sha}`, {
      headers: { Accept: "application/vnd.github+json" },
      next: { revalidate: 86_400 },
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) return undefined;
    const data = (await res.json()) as { commit?: { message?: string } };
    return data.commit?.message?.split("\n")[0];
  } catch {
    return undefined;
  }
}

/** Commit em vigor: aparece ao passar o mouse no canto inferior direito (computador). */
export async function BuildInfo() {
  // Vercel: VERCEL_GIT_COMMIT_SHA · Coolify: SOURCE_COMMIT (disponível em tempo de execução)
  const sha = process.env.VERCEL_GIT_COMMIT_SHA || process.env.SOURCE_COMMIT;
  const repo = repoSlug();
  const message = sha ? await commitMessage(repo, sha) : undefined;
  const href = sha ? `https://github.com/${repo}/commit/${sha}` : undefined;

  return (
    <div className="group fixed bottom-0 right-0 z-[70] hidden size-12 items-end justify-end p-2 hover:size-auto lg:flex">
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="pointer-events-none flex max-w-xs translate-y-1 items-center gap-2 rounded-full border border-line bg-surface/95 px-3 py-1.5 font-mono text-[10.5px] text-muted opacity-0 shadow-lg backdrop-blur transition-all duration-300 group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:opacity-100 hover:text-fg"
      >
        <GitCommitHorizontal className="size-3.5 shrink-0" />
        <span className="text-fg">{sha ? sha.slice(0, 7) : "local"}</span>
        {message && <span className="truncate">{message}</span>}
      </a>
    </div>
  );
}
