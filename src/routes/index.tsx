import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { AppShell } from "@/components/AppShell";
import { getAccounts, getExpenses, getReceipts, getWiseTransfers, isRealDebit } from "@/lib/db";
import { yen, inr, dateLabel } from "@/lib/format";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { ArrowUpRight, Receipt as ReceiptIcon, Send } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [{ title: "Overview — Yen Tracker" }] }),
  component: () => <AppShell><Dashboard /></AppShell>,
});

function Dashboard() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const accounts = useQuery({ queryKey: ["accounts"], queryFn: getAccounts });
  const expenses = useQuery({ queryKey: ["expenses"], queryFn: getExpenses });
  const receipts = useQuery({ queryKey: ["receipts"], queryFn: getReceipts });
  const transfers = useQuery({ queryKey: ["wise_transfers"], queryFn: getWiseTransfers });

  // Redirect to onboarding if profile.onboarded === false
  useEffect(() => {
    if (!session) return;
    (async () => {
      const { data } = await supabase.from("profiles").select("onboarded").eq("id", session.user.id).maybeSingle();
      if (data && (data as any).onboarded === false) navigate({ to: "/onboarding" });
    })();
  }, [session, navigate]);

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthSpend = (expenses.data ?? [])
    .filter((e) => isRealDebit(e) && new Date(e.expense_date) >= monthStart)
    .reduce((a, b) => a + b.amount_yen, 0);

  const byAccount = new Map<string, number>();
  (expenses.data ?? []).filter((e) => isRealDebit(e) && new Date(e.expense_date) >= monthStart)
    .forEach((e) => byAccount.set(e.account_id, (byAccount.get(e.account_id) ?? 0) + e.amount_yen));

  const sentHomeYen = (transfers.data ?? []).reduce((a, t) => a + t.amount_sent_yen, 0);
  const sentHomeInr = (transfers.data ?? []).reduce((a, t) => a + t.inr_received, 0);

  return (
    <div className="space-y-10">
      <header>
        <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
          {now.toLocaleDateString("en-US", { weekday: "long" })} · {dateLabel(now)}
        </p>
        <h1 className="font-display text-5xl font-bold tracking-tight mt-1">Overview</h1>
      </header>

      <section>
        <h2 className="font-mono text-[11px] uppercase tracking-[0.25em] text-muted-foreground mb-3">Accounts</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          {accounts.data?.map((a) => {
            const spent = byAccount.get(a.id) ?? 0;
            const isCredit = a.bank_type === "paypay_credit";
            const remaining = isCredit ? Math.max(0, a.credit_limit_yen - a.balance_yen) : 0;
            return (
              <Link
                key={a.id}
                to="/accounts/$accountId"
                params={{ accountId: a.id }}
                className="rounded-lg border border-border bg-card p-6 shadow-paper relative overflow-hidden group hover:shadow-lg transition"
              >
                <div className="absolute inset-x-0 top-0 h-1" style={{ background: a.color }} />
                <div className="flex items-center justify-between">
                  <div className="font-display text-xl font-semibold">{a.name}</div>
                  <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground inline-flex items-center gap-1">
                    {a.bank_type} <ArrowUpRight className="size-3 opacity-0 group-hover:opacity-100 transition" />
                  </span>
                </div>
                <p className="mt-6 font-mono text-3xl font-medium tabular-nums">
                  {isCredit ? yen(remaining) : yen(a.balance_yen)}
                </p>
                <p className="mt-1 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
                  {isCredit
                    ? `Available · limit ${yen(a.credit_limit_yen)} · owed ${yen(a.balance_yen)}`
                    : `This month · ${yen(spent)} spent`}
                </p>
              </Link>
            );
          })}
          <Link
            to="/wise"
            className="rounded-lg border-2 border-foreground bg-foreground text-background p-6 shadow-paper relative overflow-hidden group hover:shadow-lg transition"
          >
            <div className="flex items-center justify-between">
              <div className="font-display text-xl font-semibold inline-flex items-center gap-2"><Send className="size-4" /> Sent home</div>
              <span className="font-mono text-[10px] uppercase tracking-widest opacity-70 inline-flex items-center gap-1">
                wise · india <ArrowUpRight className="size-3 opacity-0 group-hover:opacity-100 transition" />
              </span>
            </div>
            <p className="mt-6 font-mono text-3xl font-medium tabular-nums">{yen(sentHomeYen)}</p>
            <p className="mt-1 font-mono text-[11px] uppercase tracking-widest opacity-70 tabular-nums">
              ≈ {inr(sentHomeInr)} · {transfers.data?.length ?? 0} transfers
            </p>
          </Link>
        </div>
      </section>

      <section className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 rounded-lg border border-border bg-card p-6 shadow-paper">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-xl font-semibold">Recent expenses</h2>
            <Link to="/expenses" className="text-xs font-mono uppercase tracking-widest text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
              All <ArrowUpRight className="size-3" />
            </Link>
          </div>
          <ul className="divide-y divide-border">
            {(expenses.data ?? []).filter((e) => !e.is_mirror).slice(0, 8).map((e) => {
              const acct = accounts.data?.find((a) => a.id === e.account_id);
              const isCred = e.payment_method === "credit";
              return (
                <li key={e.id} className="flex items-center justify-between py-3">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{e.description ?? <span className="text-muted-foreground capitalize">{e.category}</span>}</div>
                    <div className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
                      {dateLabel(e.expense_date)} · {acct?.name ?? "—"} · {e.category}
                    </div>
                  </div>
                  <div className={`font-mono tabular-nums ${isCred ? "text-emerald-700" : ""}`}>{isCred ? "+" : "−"}{yen(e.amount_yen)}</div>
                </li>
              );
            })}
            {expenses.data?.length === 0 && (
              <li className="py-12 text-center text-sm text-muted-foreground">No expenses yet. Open an account to log one.</li>
            )}
          </ul>
          <div className="mt-6 border-t border-dashed border-foreground/20 pt-4 flex justify-between font-mono text-sm">
            <span className="uppercase tracking-widest text-muted-foreground">{now.toLocaleDateString("en-US", { month: "long" })} total</span>
            <span className="tabular-nums font-semibold">{yen(monthSpend)}</span>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-6 shadow-paper">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-xl font-semibold">Latest receipts</h2>
            <Link to="/receipts" className="text-xs font-mono uppercase tracking-widest text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
              All <ArrowUpRight className="size-3" />
            </Link>
          </div>
          <ul className="space-y-3">
            {(receipts.data ?? []).slice(0, 5).map((r) => (
              <li key={r.id} className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-md bg-paper-mute"><ReceiptIcon className="size-4" /></div>
                <div className="flex-1 min-w-0">
                  <div className="truncate font-medium">{r.merchant ?? "Scanning…"}</div>
                  <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{dateLabel(r.created_at)}</div>
                </div>
                <div className="font-mono text-sm tabular-nums">{yen(r.total_yen)}</div>
              </li>
            ))}
            {receipts.data?.length === 0 && (
              <li className="py-10 text-center text-sm text-muted-foreground">No receipts scanned yet.</li>
            )}
          </ul>
        </div>
      </section>
    </div>
  );
}
