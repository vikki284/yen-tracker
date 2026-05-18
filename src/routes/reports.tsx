import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { getAccounts, getExpenses } from "@/lib/db";
import { yen } from "@/lib/format";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChevronLeft, ChevronRight } from "lucide-react";

export const Route = createFileRoute("/reports")({
  head: () => ({ meta: [{ title: "Reports — Chōbo" }] }),
  component: () => <AppShell><ReportsPage /></AppShell>,
});

const CAT_COLORS = ["#0d0d0d","#bf0000","#5c5c5c","#a89770","#3b3b3b","#8e8e8e","#c9a84c","#1f4f3f","#7a3a2a","#b8b8b8"];

function ReportsPage() {
  const accounts = useQuery({ queryKey: ["accounts"], queryFn: getAccounts });
  const expenses = useQuery({ queryKey: ["expenses"], queryFn: getExpenses });
  const today = new Date();
  const [cursor, setCursor] = useState(new Date(today.getFullYear(), today.getMonth(), 1));

  const { byDay, byCat, byAcct, total, txCount } = useMemo(() => {
    const start = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const end = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    const inMonth = (expenses.data ?? []).filter((e) => {
      const d = new Date(e.expense_date); return d >= start && d < end;
    });
    const days = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
    const byDay = Array.from({ length: days }, (_, i) => ({ day: i + 1, amount: 0 }));
    const catMap = new Map<string, number>();
    const acctMap = new Map<string, number>();
    let total = 0;
    inMonth.forEach((e) => {
      byDay[new Date(e.expense_date).getDate() - 1].amount += e.amount_yen;
      catMap.set(e.category, (catMap.get(e.category) ?? 0) + e.amount_yen);
      acctMap.set(e.account_id, (acctMap.get(e.account_id) ?? 0) + e.amount_yen);
      total += e.amount_yen;
    });
    const byCat = [...catMap.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
    const byAcct = [...acctMap.entries()].map(([id, value]) => ({
      name: accounts.data?.find((a) => a.id === id)?.name ?? "—", value,
    }));
    return { byDay, byCat, byAcct, total, txCount: inMonth.length };
  }, [expenses.data, accounts.data, cursor]);

  const label = cursor.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-muted-foreground">Monthly Report</p>
          <h1 className="font-display text-5xl font-bold tracking-tight mt-1">{label}</h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))} className="size-10 rounded-md border border-border hover:bg-paper-mute flex items-center justify-center"><ChevronLeft className="size-4" /></button>
          <button onClick={() => setCursor(new Date(today.getFullYear(), today.getMonth(), 1))} className="px-3 h-10 rounded-md border border-border text-xs font-mono uppercase tracking-widest hover:bg-paper-mute">Today</button>
          <button disabled={cursor.getFullYear() === today.getFullYear() && cursor.getMonth() === today.getMonth()} onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))} className="size-10 rounded-md border border-border hover:bg-paper-mute disabled:opacity-40 flex items-center justify-center"><ChevronRight className="size-4" /></button>
        </div>
      </header>

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="Total spent" value={yen(total)} />
        <Stat label="Transactions" value={txCount.toString()} />
        <Stat label="Daily avg" value={yen(total / Math.max(1, new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate()))} />
        <Stat label="Largest category" value={byCat[0]?.name ?? "—"} mono={false} />
      </section>

      <section className="rounded-lg border border-border bg-card p-6 shadow-paper">
        <h2 className="font-display text-xl font-semibold mb-4">Daily spend</h2>
        <div className="h-72">
          <ResponsiveContainer>
            <BarChart data={byDay}>
              <CartesianGrid stroke="oklch(0.86 0.01 80)" vertical={false} strokeDasharray="2 4" />
              <XAxis dataKey="day" tick={{ fontSize: 10, fontFamily: "JetBrains Mono" }} />
              <YAxis tick={{ fontSize: 10, fontFamily: "JetBrains Mono" }} tickFormatter={(v) => `¥${v >= 1000 ? `${(v/1000).toFixed(0)}k` : v}`} />
              <Tooltip formatter={(v: number) => yen(v)} labelFormatter={(d) => `Day ${d}`} contentStyle={{ borderRadius: 8, border: "1px solid oklch(0.86 0.01 80)", fontFamily: "JetBrains Mono", fontSize: 12 }} />
              <Bar dataKey="amount" fill="#0d0d0d" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="grid lg:grid-cols-2 gap-6">
        <div className="rounded-lg border border-border bg-card p-6 shadow-paper">
          <h2 className="font-display text-xl font-semibold mb-4">By category</h2>
          {byCat.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-12">No expenses this month.</p>
          ) : (
            <div className="grid grid-cols-2 gap-4 items-center">
              <div className="h-56">
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={byCat} dataKey="value" nameKey="name" innerRadius={45} outerRadius={80} stroke="none">
                      {byCat.map((_, i) => <Cell key={i} fill={CAT_COLORS[i % CAT_COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v: number) => yen(v)} contentStyle={{ borderRadius: 8, fontFamily: "JetBrains Mono", fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="space-y-1.5 font-mono text-xs">
                {byCat.map((c, i) => (
                  <li key={c.name} className="flex items-center gap-2">
                    <span className="size-2.5 rounded-sm" style={{ background: CAT_COLORS[i % CAT_COLORS.length] }} />
                    <span className="capitalize flex-1">{c.name}</span>
                    <span className="tabular-nums">{yen(c.value)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="rounded-lg border border-border bg-card p-6 shadow-paper">
          <h2 className="font-display text-xl font-semibold mb-4">By account</h2>
          <ul className="space-y-4">
            {byAcct.map((a) => {
              const pct = total ? (a.value / total) * 100 : 0;
              return (
                <li key={a.name}>
                  <div className="flex justify-between font-mono text-xs">
                    <span>{a.name}</span><span className="tabular-nums">{yen(a.value)}</span>
                  </div>
                  <div className="mt-1 h-2 rounded-full bg-paper-mute overflow-hidden">
                    <div className="h-full bg-foreground" style={{ width: `${pct}%` }} />
                  </div>
                </li>
              );
            })}
            {byAcct.length === 0 && <li className="text-sm text-muted-foreground text-center py-12">No account activity.</li>}
          </ul>
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-card p-5 shadow-paper">
      <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className={`mt-2 text-2xl font-semibold ${mono ? "font-mono tabular-nums" : "font-display capitalize"}`}>{value}</div>
    </div>
  );
}
