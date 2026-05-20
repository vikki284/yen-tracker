import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { NewExpenseDialog } from "@/components/NewExpenseDialog";
import { SettleUpDialog } from "@/components/SettleUpDialog";
import { EditExpenseDialog } from "@/components/EditExpenseDialog";
import { getAccounts, getExpenses, deleteExpense, recomputeBalances, setOpeningBalance, isRealDebit, type Expense } from "@/lib/db";
import { yen, dateLabel, paypayBillDate, billMonthKey } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Pencil, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/accounts/$accountId")({
  head: () => ({ meta: [{ title: "Account — Chōbo" }] }),
  component: () => <AppShell><AccountPage /></AppShell>,
});

function AccountPage() {
  const { accountId } = Route.useParams();
  const qc = useQueryClient();
  const accounts = useQuery({ queryKey: ["accounts"], queryFn: getAccounts });
  const expenses = useQuery({ queryKey: ["expenses"], queryFn: getExpenses });
  const [editing, setEditing] = useState<Expense | null>(null);
  const [opening, setOpening] = useState<string>("");

  const acct = accounts.data?.find((a) => a.id === accountId);
  const list = useMemo(
    () => (expenses.data ?? []).filter((e) => e.account_id === accountId),
    [expenses.data, accountId],
  );

  const del = useMutation({
    mutationFn: deleteExpense,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["expenses"] });
      qc.invalidateQueries({ queryKey: ["accounts"] });
      toast.success("Deleted · balance reverted");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const recompute = useMutation({
    mutationFn: recomputeBalances,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["accounts"] });
      toast.success("Balances rebuilt from logged data");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const updateOpening = useMutation({
    mutationFn: async () => {
      if (!acct) return;
      await setOpeningBalance(acct.id, parseInt(opening || "0", 10) || 0);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["accounts"] });
      toast.success("Opening balance saved · click Recompute");
      setOpening("");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const isCredit = acct?.bank_type === "paypay_credit";
  const isAichi = acct?.bank_type === "aichi";

  // PayPay credit bill grouping (only real charges count, not settlements/prepayments)
  const billGroups = useMemo(() => {
    if (!isCredit) return new Map<string, { label: string; date: Date; total: number }>();
    const m = new Map<string, { label: string; date: Date; total: number }>();
    for (const e of list) {
      if (e.is_settlement || e.is_mirror || e.payment_method !== "debit") continue;
      const key = billMonthKey(e.expense_date);
      const bd = paypayBillDate(e.expense_date);
      const prev = m.get(key) ?? {
        label: bd.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
        date: bd,
        total: 0,
      };
      prev.total += e.amount_yen;
      m.set(key, prev);
    }
    return m;
  }, [list, isCredit]);

  const today = new Date();
  const unpaidBills = useMemo(
    () => Array.from(billGroups.values()).filter((b) => b.date >= today).sort((a, b) => +a.date - +b.date),
    [billGroups, today],
  );
  const creditUsed = acct?.balance_yen ?? 0; // outstanding owed
  const creditLeft = Math.max(0, (acct?.credit_limit_yen ?? 0) - creditUsed);

  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const monthSpent = list
    .filter((e) => isRealDebit(e) && new Date(e.expense_date) >= monthStart)
    .reduce((a, b) => a + b.amount_yen, 0);

  // Sim + Gym yearly aggregation (Aichi only)
  const utilByYear = useMemo(() => {
    if (!isAichi) return [] as { year: string; sim: number; gym: number }[];
    const m = new Map<string, { sim: number; gym: number }>();
    for (const e of list) {
      if (e.is_mirror || e.is_settlement) continue;
      if (e.category !== "sim" && e.category !== "gym") continue;
      const y = e.expense_date.slice(0, 4);
      const cur = m.get(y) ?? { sim: 0, gym: 0 };
      if (e.category === "sim") cur.sim += e.amount_yen;
      else cur.gym += e.amount_yen;
      m.set(y, cur);
    }
    return Array.from(m.entries()).sort((a, b) => b[0].localeCompare(a[0])).map(([year, v]) => ({ year, ...v }));
  }, [list, isAichi]);

  if (!acct) {
    return <div className="text-sm text-muted-foreground">Loading account…</div>;
  }

  return (
    <div className="space-y-8">
      <Link to="/" className="font-mono text-[11px] uppercase tracking-[0.25em] text-muted-foreground inline-flex items-center gap-1 hover:text-foreground">
        <ArrowLeft className="size-3" /> Overview
      </Link>

      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-dashed border-foreground/20 pb-6">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-muted-foreground">{acct.bank_type}</p>
          <h1 className="font-display text-5xl font-bold tracking-tight mt-1" style={{ color: acct.color }}>{acct.name}</h1>
          <p className="mt-3 font-mono text-3xl tabular-nums">{yen(acct.balance_yen)}</p>
          {isCredit && <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">owed</p>}
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex gap-2">
            {isCredit && <SettleUpDialog paypayAccountId={acct.id} suggested={acct.balance_yen} />}
            <NewExpenseDialog defaults={{ account_id: acct.id }} lockAccount />
          </div>
          <Button size="sm" variant="ghost" className="gap-1.5 text-xs" onClick={() => recompute.mutate()} disabled={recompute.isPending}>
            <RefreshCw className="size-3" /> {recompute.isPending ? "…" : "Recompute balances"}
          </Button>
        </div>
      </header>

      {/* Opening balance editor */}
      <div className="rounded-md border border-dashed border-foreground/30 bg-paper-mute/30 p-3 flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[200px]">
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Opening balance</p>
          <p className="font-mono text-sm tabular-nums">{yen(acct.opening_balance_yen)}</p>
        </div>
        <Input
          inputMode="numeric"
          value={opening}
          onChange={(e) => setOpening(e.target.value.replace(/[^\d-]/g, ""))}
          placeholder="set new opening (¥)"
          className="max-w-[200px]"
        />
        <Button size="sm" variant="outline" onClick={() => updateOpening.mutate()} disabled={updateOpening.isPending || !opening}>
          Save & recompute next
        </Button>
      </div>

      {isCredit ? (
        <section className="grid md:grid-cols-3 gap-4">
          <Card label="Credit limit" value={yen(acct.credit_limit_yen)} />
          <Card label="Currently owed" value={yen(creditUsed)} />
          <Card label="Credit available" value={yen(creditLeft)} accent />
          <div className="md:col-span-3 rounded-lg border border-border bg-card p-5 shadow-paper">
            <h3 className="font-display text-lg font-bold mb-3">Upcoming bills</h3>
            {unpaidBills.length === 0 && <p className="text-sm text-muted-foreground">Nothing pending.</p>}
            <ul className="divide-y divide-border">
              {unpaidBills.map((b) => (
                <li key={b.label} className="flex justify-between py-3">
                  <div>
                    <div className="font-medium">{b.label}</div>
                    <div className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
                      Charges on {dateLabel(b.date)}
                    </div>
                  </div>
                  <div className="font-mono tabular-nums font-semibold">{yen(b.total)}</div>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : (
        <section className="grid md:grid-cols-2 gap-4">
          <Card label="This month spent (debits only)" value={yen(monthSpent)} />
          <Card label="Total logged entries" value={list.length.toString()} />
        </section>
      )}

      {isAichi && utilByYear.length > 0 && (
        <section className="rounded-lg border border-border bg-card p-5 shadow-paper">
          <h3 className="font-display text-lg font-bold mb-3">SIM & Gym — yearly</h3>
          <table className="w-full text-sm">
            <thead className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              <tr><th className="text-left p-2">Year</th><th className="text-right p-2">SIM</th><th className="text-right p-2">Gym</th><th className="text-right p-2">Total</th></tr>
            </thead>
            <tbody>
              {utilByYear.map((y) => (
                <tr key={y.year} className="border-t border-border">
                  <td className="p-2 font-mono">{y.year}</td>
                  <td className="p-2 text-right font-mono tabular-nums">{yen(y.sim)}</td>
                  <td className="p-2 text-right font-mono tabular-nums">{yen(y.gym)}</td>
                  <td className="p-2 text-right font-mono tabular-nums font-semibold">{yen(y.sim + y.gym)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section className="rounded-lg border border-border bg-card shadow-paper overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h2 className="font-display text-xl font-bold">Activity</h2>
          <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{list.length} entries</span>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-paper-mute/60 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            <tr>
              <th className="text-left p-3">Date</th>
              <th className="text-left p-3">Description</th>
              <th className="text-left p-3">Category</th>
              <th className="text-left p-3">Type</th>
              <th className="text-right p-3">Amount</th>
              <th className="text-right p-3">Charge</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {list.map((e) => {
              const isCreditEntry = e.payment_method === "credit" || e.is_mirror;
              const label = e.is_settlement
                ? (e.is_mirror ? "settle (paid)" : "settle-up")
                : e.is_mirror ? "transfer in" : e.payment_method;
              return (
                <tr key={e.id} className={`border-t border-border hover:bg-paper-mute/40 ${e.is_mirror ? "bg-paper-mute/20" : ""}`}>
                  <td className="p-3 font-mono text-xs">{dateLabel(e.expense_date)}</td>
                  <td className="p-3">{e.description ?? <span className="text-muted-foreground italic">—</span>}</td>
                  <td className="p-3 capitalize">{e.category}</td>
                  <td className={`p-3 capitalize text-xs font-mono ${isCreditEntry ? "text-emerald-700" : "text-muted-foreground"}`}>{label}</td>
                  <td className={`p-3 text-right font-mono tabular-nums ${isCreditEntry ? "text-emerald-700" : ""}`}>
                    {isCreditEntry ? "+" : "−"}{yen(e.amount_yen)}
                  </td>
                  <td className="p-3 text-right font-mono tabular-nums text-muted-foreground">{e.charge_yen ? yen(e.charge_yen) : "—"}</td>
                  <td className="p-3 text-right whitespace-nowrap">
                    {!e.is_mirror && (
                      <Button size="icon" variant="ghost" onClick={() => setEditing(e)} aria-label="Edit">
                        <Pencil className="size-4" />
                      </Button>
                    )}
                    <Button size="icon" variant="ghost" onClick={() => del.mutate(e.id)} aria-label="Delete" disabled={e.is_mirror}>
                      <Trash2 className="size-4" />
                    </Button>
                  </td>
                </tr>
              );
            })}
            {list.length === 0 && (
              <tr><td colSpan={7} className="p-12 text-center text-sm text-muted-foreground">No expenses for this account yet.</td></tr>
            )}
          </tbody>
        </table>
      </section>

      <EditExpenseDialog expense={editing} open={!!editing} onOpenChange={(v) => !v && setEditing(null)} />
    </div>
  );
}

function Card({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`rounded-lg border p-5 shadow-paper ${accent ? "border-foreground bg-foreground text-background" : "border-border bg-card"}`}>
      <p className="font-mono text-[10px] uppercase tracking-[0.25em] opacity-70">{label}</p>
      <p className="mt-2 font-display text-3xl font-bold tabular-nums">{value}</p>
    </div>
  );
}
