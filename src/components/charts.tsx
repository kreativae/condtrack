"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from "recharts";

// Paleta validada (scripts do skill dataviz): --chart-1 dourado, --chart-2 azul.
const tooltipStyle = {
  contentStyle: { background: "var(--surface-2)", border: "1px solid var(--line-strong)", borderRadius: 12, fontSize: 12, color: "var(--fg)" },
  labelStyle: { color: "var(--fg)", fontWeight: 600, marginBottom: 4 },
  itemStyle: { color: "var(--fg-2)" },
  cursor: { fill: "var(--fg)", fillOpacity: 0.04 },
};
const axisTick = { fill: "var(--muted)", fontSize: 11 };

/** Barras horizontais de uma série (ranking/magnitude). */
export function RankBars({ data, unit = "", height }: { data: { name: string; value: number }[]; unit?: string; height?: number }) {
  if (!data.length) return <p className="py-10 text-center text-sm text-muted">Sem dados no período.</p>;
  return (
    <ResponsiveContainer width="100%" height={height ?? Math.max(160, data.length * 38)}>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 36, top: 4, bottom: 4 }} barCategoryGap={8}>
        <CartesianGrid horizontal={false} stroke="var(--line)" />
        <XAxis type="number" tick={axisTick} axisLine={false} tickLine={false} allowDecimals={false} />
        <YAxis type="category" dataKey="name" tick={{ ...axisTick, fill: "var(--fg-2)" }} width={130} axisLine={false} tickLine={false} />
        <Tooltip {...tooltipStyle} formatter={(v) => [`${v}${unit}`, "Total"]} />
        <Bar dataKey="value" fill="var(--chart-1)" radius={[0, 4, 4, 0]} maxBarSize={18} label={{ position: "right", fill: "var(--fg-2)", fontSize: 11 }} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Duas séries lado a lado (ex.: abertas × concluídas por condomínio). */
export function PairBars({ data, a, b }: { data: { name: string; a: number; b: number }[]; a: string; b: string }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ left: -16, right: 8, top: 8 }} barGap={2}>
        <CartesianGrid vertical={false} stroke="var(--line)" />
        <XAxis dataKey="name" tick={axisTick} axisLine={false} tickLine={false} />
        <YAxis tick={axisTick} axisLine={false} tickLine={false} allowDecimals={false} />
        <Tooltip {...tooltipStyle} />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: "var(--fg-2)" }} />
        <Bar dataKey="a" name={a} fill="var(--chart-1)" radius={[4, 4, 0, 0]} maxBarSize={28} />
        <Bar dataKey="b" name={b} fill="var(--chart-2)" radius={[4, 4, 0, 0]} maxBarSize={28} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Colunas verticais de uma série (ex.: receita por mês). Valores em centavos. */
export function MonthBars({ data }: { data: { name: string; value: number }[] }) {
  const fmt = (c: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(c / 100);
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ left: 0, right: 8, top: 8 }} barCategoryGap={6}>
        <CartesianGrid vertical={false} stroke="var(--line)" />
        <XAxis dataKey="name" tick={axisTick} axisLine={false} tickLine={false} />
        <YAxis tick={axisTick} axisLine={false} tickLine={false} width={64} tickFormatter={(v) => fmt(Number(v))} />
        <Tooltip {...tooltipStyle} formatter={(v) => [fmt(Number(v)), "Receita"]} />
        <Bar dataKey="value" fill="var(--chart-1)" radius={[4, 4, 0, 0]} maxBarSize={32} />
      </BarChart>
    </ResponsiveContainer>
  );
}
