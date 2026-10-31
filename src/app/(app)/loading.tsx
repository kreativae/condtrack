/** Enquanto a página busca os dados: o desenho dela (cabeçalho, números, blocos) com brilho passando. */
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Carregando" className="animate-in">
      <div className="mb-8 space-y-3">
        <div className="skeleton h-4 w-28" />
        <div className="skeleton h-8 w-72 max-w-full" />
        <div className="skeleton h-4 w-96 max-w-full" />
      </div>
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-2xl border border-line bg-surface p-5">
            <div className="skeleton h-3 w-24" />
            <div className="skeleton mt-3 h-7 w-16" />
          </div>
        ))}
      </div>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="space-y-3 rounded-2xl border border-line bg-surface p-5">
          <div className="skeleton h-4 w-40" />
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="skeleton size-10 shrink-0 rounded-xl" />
              <div className="flex-1 space-y-2">
                <div className="skeleton h-3.5 w-3/5" />
                <div className="skeleton h-3 w-2/5" />
              </div>
            </div>
          ))}
        </div>
        <div className="skeleton min-h-64 rounded-2xl" />
      </div>
    </div>
  );
}
