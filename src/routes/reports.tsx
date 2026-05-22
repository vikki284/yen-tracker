import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { getAccounts, getExpenses } from "@/lib/db";
import { yen } from "@/lib/format";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChevronLeft, ChevronRight } from "lucide-react";

export const Route = createFileRoute("/reports")({
  head: () => ({ meta: [{ title: "Reports — Yen Tracker" }] }),
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
      if (e.is_mirror || e.is_settlement || e.payment_method !== "debit") return false;
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

  // SIM + Gym by year-month (across all accounts)
  const utilities = useMemo(() => {
    const m = new Map<string, Map<string, { sim: number; gym: number }>>();
    for (const e of expenses.data ?? []) {
      if (e.is_mirror || e.is_settlement) continue;
      if (e.category !== "sim" && e.category !== "gym") continue;
      const y = e.expense_date.slice(0, 4);
      const mo = e.expense_date.slice(5, 7);
      if (!m.has(y)) m.set(y, new Map());
      const yMap = m.get(y)!;
      const cur = yMap.get(mo) ?? { sim: 0, gym: 0 };
      if (e.category === "sim") cur.sim += e.amount_yen;
      else cur.gym += e.amount_yen;
      yMap.set(mo, cur);
    }
    return Array.from(m.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([year, yMap]) => ({
        year,
        months: Array.from({ length: 12 }, (_, i) => {
          const k = String(i + 1).padStart(2, "0");
          const v = yMap.get(k) ?? { sim: 0, gym: 0 };
          return { month: k, ...v };
        }),
        simTotal: Array.from(yMap.values()).reduce((a, b) => a + b.sim, 0),
        gymTotal: Array.from(yMap.values()).reduce((a, b) => a + b.gym, 0),
      }));
  }, [expenses.data]);

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

      {utilities.length > 0 && (
        <section className="rounded-lg border border-border bg-card p-6 shadow-paper">
          <h2 className="font-display text-xl font-semibold mb-1">SIM & Gym — monthly by year</h2>
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-4">Recurring utilities across all accounts</p>
          <div className="space-y-6">
            {utilities.map((y) => (
              <div key={y.year}>
                <div className="flex items-baseline justify-between mb-2">
                  <h3 className="font-display text-2xl font-bold">{y.year}</h3>
                  <span className="font-mono text-xs text-muted-foreground tabular-nums">SIM {yen(y.simTotal)} · Gym {yen(y.gymTotal)} · Total {yen(y.simTotal + y.gymTotal)}</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs min-w-[640px]">
                    <thead className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                      <tr>
                        <th className="text-left p-1.5">Cat</th>
                        {y.months.map((m) => <th key={m.month} className="text-right p-1.5">{m.month}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-t border-border">
                        <td className="p-1.5 font-mono">SIM</td>
                        {y.months.map((m) => <td key={m.month} className="text-right p-1.5 font-mono tabular-nums">{m.sim ? yen(m.sim) : "—"}</td>)}
                      </tr>
                      <tr className="border-t border-border">
                        <td className="p-1.5 font-mono">Gym</td>
                        {y.months.map((m) => <td key={m.month} className="text-right p-1.5 font-mono tabular-nums">{m.gym ? yen(m.gym) : "—"}</td>)}
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
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
