// Esqueleto enquanto a página carrega: blocos no formato de topo, números e lista (em vez de tela parada).
const bar = "animate-pulse rounded-lg bg-bg-2";

export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Carregando" className="space-y-8">
      <div className="space-y-3">
        <div className={`${bar} h-3.5 w-40`} />
        <div className={`${bar} h-8 w-72 max-w-full`} />
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="space-y-3 rounded-2xl border border-line bg-surface p-5">
            <div className={`${bar} h-3 w-24`} />
            <div className={`${bar} h-7 w-16`} />
          </div>
        ))}
      </div>
      <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="flex items-center gap-4 px-5 py-4">
            <div className={`${bar} size-10 shrink-0 rounded-xl`} />
            <div className="flex-1 space-y-2">
              <div className={`${bar} h-3 ${["w-2/3", "w-1/2", "w-3/5", "w-2/5", "w-1/2"][i]}`} />
              <div className={`${bar} h-3 w-1/3 opacity-70`} />
            </div>
            <div className={`${bar} hidden h-6 w-20 rounded-full sm:block`} />
          </div>
        ))}
      </div>
    </div>
  );
}
