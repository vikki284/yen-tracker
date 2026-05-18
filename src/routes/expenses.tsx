import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { NewExpenseDialog } from "@/components/NewExpenseDialog";
import { getAccounts, getExpenses } from "@/lib/db";
import { yen, dateLabel, CATEGORIES } from "@/lib/format";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/expenses")({
  head: () => ({ meta: [{ title: "Expenses — Chōbo" }] }),
  component: () => <AppShell><ExpensesPage /></AppShell>,
});

function ExpensesPage() {
  const qc = useQueryClient();
  const accounts = useQuery({ queryKey: ["accounts"], queryFn: getAccounts });
  const expenses = useQuery({ queryKey: ["expenses"], queryFn: getExpenses });
  const [q, setQ] = useState("");
  const [acct, setAcct] = useState<string>("all");
  const [cat, setCat] = useState<string>("all");

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("expenses").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["expenses"] }); toast.success("Deleted"); },
    onError: (e) => toast.error((e as Error).message),
  });

  const filtered = useMemo(() => {
    return (expenses.data ?? []).filter((e) => {
      if (acct !== "all" && e.account_id !== acct) return false;
      if (cat !== "all" && e.category !== cat) return false;
      if (q && !(e.description ?? "").toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    });
  }, [expenses.data, acct, cat, q]);

  const total = filtered.reduce((a, b) => a + b.amount_yen, 0);

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-muted-foreground">Ledger</p>
          <h1 className="font-display text-5xl font-bold tracking-tight mt-1">Expenses</h1>
        </div>
        <NewExpenseDialog />
      </header>

      <div className="rounded-lg border border-border bg-card p-4 shadow-paper grid sm:grid-cols-4 gap-3">
        <Input placeholder="Search notes…" value={q} onChange={(e) => setQ(e.target.value)} />
        <Select value={acct} onValueChange={setAcct}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All accounts</SelectItem>
            {accounts.data?.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={cat} onValueChange={setCat}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {CATEGORIES.map((c) => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex items-center justify-end font-mono text-sm">
          <span className="text-muted-foreground uppercase tracking-widest text-[10px] mr-2">Total</span>
          <span className="tabular-nums font-semibold">{yen(total)}</span>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card shadow-paper overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-paper-mute/60 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            <tr><th className="text-left p-3">Date</th><th className="text-left p-3">Description</th><th className="text-left p-3">Account</th><th className="text-left p-3">Category</th><th className="text-right p-3">Amount</th><th className="p-3" /></tr>
          </thead>
          <tbody>
            {filtered.map((e) => {
              const a = accounts.data?.find((x) => x.id === e.account_id);
              return (
                <tr key={e.id} className="border-t border-border hover:bg-paper-mute/40">
                  <td className="p-3 font-mono text-xs">{dateLabel(e.expense_date)}</td>
                  <td className="p-3">{e.description ?? <span className="text-muted-foreground italic">—</span>}</td>
                  <td className="p-3">{a?.name ?? "—"}</td>
                  <td className="p-3 capitalize">{e.category}</td>
                  <td className="p-3 text-right font-mono tabular-nums">{yen(e.amount_yen)}</td>
                  <td className="p-3 text-right">
                    <Button size="icon" variant="ghost" onClick={() => del.mutate(e.id)} aria-label="Delete">
                      <Trash2 className="size-4" />
                    </Button>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={6} className="p-12 text-center text-sm text-muted-foreground">No expenses match these filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
