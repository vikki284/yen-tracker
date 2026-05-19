import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { NewExpenseDialog } from "@/components/NewExpenseDialog";
import { getAccounts, getExpenses } from "@/lib/db";
import { yen, dateLabel, paypayBillDate, billMonthKey } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
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

  const acct = accounts.data?.find((a) => a.id === accountId);
  const list = useMemo(
    () => (expenses.data ?? []).filter((e) => e.account_id === accountId),
    [expenses.data, accountId],
  );

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("expenses").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["expenses"] });
      qc.invalidateQueries({ queryKey: ["accounts"] });
      toast.success("Deleted");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const isCredit = acct?.bank_type === "paypay_credit";

  // Group PayPay credit expenses by bill month
  const billGroups = useMemo(() => {
    if (!isCredit) return new Map<string, { label: string; date: Date; total: number }>();
    const m = new Map<string, { label: string; date: Date; total: number }>();
    for (const e of list) {
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
  const creditUsed = unpaidBills.reduce((s, b) => s + b.total, 0);
  const creditLeft = Math.max(0, (acct?.credit_limit_yen ?? 0) - creditUsed);

  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const monthSpent = list.filter((e) => new Date(e.expense_date) >= monthStart).reduce((a, b) => a + b.amount_yen, 0);

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
        </div>
        <NewExpenseDialog defaults={{ account_id: acct.id }} lockAccount />
      </header>

      {isCredit ? (
        <section className="grid md:grid-cols-3 gap-4">
          <Card label="Credit limit" value={yen(acct.credit_limit_yen)} />
          <Card label="Pending bills" value={yen(creditUsed)} />
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
          <Card label="This month spent" value={yen(monthSpent)} />
          <Card label="Total logged entries" value={list.length.toString()} />
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
              <th className="text-left p-3">Method</th>
              <th className="text-right p-3">Amount</th>
              <th className="text-right p-3">Charge</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {list.map((e) => (
              <tr key={e.id} className="border-t border-border hover:bg-paper-mute/40">
                <td className="p-3 font-mono text-xs">{dateLabel(e.expense_date)}</td>
                <td className="p-3">{e.description ?? <span className="text-muted-foreground italic">—</span>}</td>
                <td className="p-3 capitalize">{e.category}</td>
                <td className="p-3 capitalize text-xs font-mono text-muted-foreground">{e.payment_method}</td>
                <td className="p-3 text-right font-mono tabular-nums">{yen(e.amount_yen)}</td>
                <td className="p-3 text-right font-mono tabular-nums text-muted-foreground">{e.charge_yen ? yen(e.charge_yen) : "—"}</td>
                <td className="p-3 text-right">
                  <Button size="icon" variant="ghost" onClick={() => del.mutate(e.id)} aria-label="Delete">
                    <Trash2 className="size-4" />
                  </Button>
                </td>
              </tr>
            ))}
            {list.length === 0 && (
              <tr><td colSpan={7} className="p-12 text-center text-sm text-muted-foreground">No expenses for this account yet.</td></tr>
            )}
          </tbody>
        </table>
      </section>
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
