import { GitCommitHorizontal } from "lucide-react";

/** Repositório do commit: o da Vercel, GIT_REPO ("dono/repo") ou este projeto */
function repoSlug() {
  const { VERCEL_GIT_REPO_OWNER: owner, VERCEL_GIT_REPO_SLUG: slug, GIT_REPO } = process.env;
  if (owner && slug) return `${owner}/${slug}`;
  return GIT_REPO?.trim() || "kreativae/condtrack";
}

/** Commit em vigor (só o código curto): aparece ao passar o mouse no canto inferior direito (computador). */
export function BuildInfo() {
  // Vercel: VERCEL_GIT_COMMIT_SHA · Coolify: SOURCE_COMMIT (disponível em tempo de execução)
  const sha = process.env.VERCEL_GIT_COMMIT_SHA || process.env.SOURCE_COMMIT;
  const href = sha ? `https://github.com/${repoSlug()}/commit/${sha}` : undefined;

  return (
    <div className="group fixed bottom-0 right-0 z-[70] hidden size-12 items-end justify-end p-2 hover:size-auto lg:flex">
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        title={sha}
        className="pointer-events-none flex translate-y-1 items-center gap-1.5 rounded-full border border-line bg-surface/95 px-3 py-1.5 font-mono text-[10.5px] text-fg opacity-0 shadow-lg backdrop-blur transition-all duration-300 group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:opacity-100 hover:text-brand"
      >
        <GitCommitHorizontal className="size-3.5 shrink-0 text-muted" />
        {sha ? sha.slice(0, 7) : "local"}
      </a>
    </div>
  );
}
