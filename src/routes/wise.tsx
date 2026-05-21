import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { getAccounts, getWiseRecipients, getWiseTransfers, getExpenses, type WiseRecipient } from "@/lib/db";
import { yen, inr, dateLabel, WISE_RECIPIENT_CATEGORIES } from "@/lib/format";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Send, Trash2 } from "lucide-react";

export const Route = createFileRoute("/wise")({
  head: () => ({ meta: [{ title: "Wise — Chōbo" }] }),
  component: () => <AppShell><WisePage /></AppShell>,
});

function WisePage() {
  const qc = useQueryClient();
  const accounts = useQuery({ queryKey: ["accounts"], queryFn: getAccounts });
  const recipients = useQuery({ queryKey: ["wise_recipients"], queryFn: getWiseRecipients });
  const transfers = useQuery({ queryKey: ["wise_transfers"], queryFn: getWiseTransfers });
  const expenses = useQuery({ queryKey: ["expenses"], queryFn: getExpenses });

  const wiseAcct = accounts.data?.find((a) => a.bank_type === "wise");

  // Totals SENT HOME: only money that was converted & received (wise_transfers)
  const totalsByRecipient = useMemo(() => {
    const m = new Map<string, { yen: number; inr: number }>();
    for (const t of transfers.data ?? []) {
      const prev = m.get(t.recipient_id) ?? { yen: 0, inr: 0 };
      m.set(t.recipient_id, { yen: prev.yen + t.amount_sent_yen, inr: prev.inr + t.inr_received });
    }
    return m;
  }, [transfers.data]);

  // Pending: Aichi expenses with mom/dad/bro/self/others categories (money queued for transfer)
  const pendingFromAichi = useMemo(() => {
    return (expenses.data ?? [])
      .filter((e) => !e.is_mirror && !e.is_settlement && WISE_RECIPIENT_CATEGORIES.has(e.category))
      .map((e) => {
        const recipient = (recipients.data ?? []).find(
          (r) => r.name.toLowerCase() === e.category.toLowerCase(),
        );
        return { expense: e, recipient };
      });
  }, [expenses.data, recipients.data]);

  const totalSentHomeYen = useMemo(
    () => (transfers.data ?? []).reduce((a, t) => a + t.amount_sent_yen, 0),
    [transfers.data],
  );
  const totalSentHomeInr = useMemo(
    () => (transfers.data ?? []).reduce((a, t) => a + t.inr_received, 0),
    [transfers.data],
  );

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("wise_transfers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["wise_transfers"] });
      qc.invalidateQueries({ queryKey: ["accounts"] });
      toast.success("Deleted");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-muted-foreground">Remittance</p>
          <h1 className="font-display text-5xl font-bold tracking-tight mt-1">Wise → India</h1>
        </div>
        <NewTransferDialog recipients={recipients.data ?? []} />
      </header>

      <section className="rounded-lg border border-border bg-card p-6 shadow-paper hidden">
        <div className="flex items-baseline justify-between">
          <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">Wise balance</p>
        </div>
        <p className="font-display text-5xl font-bold tabular-nums mt-2">{yen(wiseAcct?.balance_yen ?? 0)}</p>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-border bg-card p-6 shadow-paper">
          <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">Wise balance</p>
          <p className="font-display text-4xl font-bold tabular-nums mt-2">{yen(wiseAcct?.balance_yen ?? 0)}</p>
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mt-1">
            Top up by logging an Aichi expense with category "wise"
          </p>
        </div>
        <div className="rounded-lg border-2 border-foreground bg-foreground text-background p-6 shadow-paper">
          <p className="font-mono text-[10px] uppercase tracking-[0.25em] opacity-70">Total sent home</p>
          <p className="font-display text-4xl font-bold tabular-nums mt-2">{yen(totalSentHomeYen)}</p>
          <p className="font-mono text-sm tabular-nums mt-1 opacity-90">≈ {inr(totalSentHomeInr)}</p>
          <p className="font-mono text-[10px] uppercase tracking-widest opacity-60 mt-1">Converted &amp; received via Wise</p>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {(recipients.data ?? []).map((r) => {
          const t = totalsByRecipient.get(r.id) ?? { yen: 0, inr: 0 };
          const pct = r.min_yen > 0 ? Math.min(100, Math.round((t.yen / r.min_yen) * 100)) : 0;
          const remaining = Math.max(0, r.min_yen - t.yen);
          return (
            <div key={r.id} className="rounded-lg border border-border bg-card p-5 shadow-paper">
              <div className="flex items-baseline justify-between">
                <h3 className="font-display text-2xl font-bold">{r.name}</h3>
                <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{r.relation}</span>
              </div>
              <div className="mt-4 space-y-2">
                <div className="flex justify-between font-mono text-xs">
                  <span className="text-muted-foreground">Sent</span>
                  <span className="tabular-nums">{yen(t.yen)} · {inr(t.inr)}</span>
                </div>
                <div className="h-2 w-full rounded-full bg-paper-mute overflow-hidden">
                  <div className="h-full bg-foreground transition-all" style={{ width: `${pct}%` }} />
                </div>
                <div className="flex justify-between font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  <span>Target {yen(r.min_yen)}</span>
                  <span>{remaining > 0 ? `${yen(remaining)} to go` : "✓ met"}</span>
                </div>
              </div>
            </div>
          );
        })}
      </section>

      <section className="rounded-lg border border-border bg-card shadow-paper overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="font-display text-xl font-bold flex items-center gap-2"><Send className="size-4" /> Transfer log</h2>
          <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            {transfers.data?.length ?? 0} transfers
          </span>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-paper-mute/60 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            <tr>
              <th className="text-left p-3">Date</th>
              <th className="text-left p-3">To</th>
              <th className="text-right p-3">Sent (¥)</th>
              <th className="text-right p-3">Fee (¥)</th>
              <th className="text-right p-3">Received (₹)</th>
              <th className="text-right p-3">Rate</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {(transfers.data ?? []).map((t) => {
              const r = recipients.data?.find((x) => x.id === t.recipient_id);
              const net = t.amount_sent_yen - t.charge_yen;
              const rate = net > 0 ? (t.inr_received / net).toFixed(4) : "—";
              return (
                <tr key={t.id} className="border-t border-border hover:bg-paper-mute/40">
                  <td className="p-3 font-mono text-xs">{dateLabel(t.transfer_date)}</td>
                  <td className="p-3 font-medium">{r?.name ?? "—"}</td>
                  <td className="p-3 text-right font-mono tabular-nums">{yen(t.amount_sent_yen)}</td>
                  <td className="p-3 text-right font-mono tabular-nums text-muted-foreground">{yen(t.charge_yen)}</td>
                  <td className="p-3 text-right font-mono tabular-nums">{inr(t.inr_received)}</td>
                  <td className="p-3 text-right font-mono text-xs text-muted-foreground tabular-nums">{rate}</td>
                  <td className="p-3 text-right">
                    <Button size="icon" variant="ghost" onClick={() => del.mutate(t.id)} aria-label="Delete">
                      <Trash2 className="size-4" />
                    </Button>
                  </td>
                </tr>
              );
            })}
            {(transfers.data ?? []).length === 0 && (
              <tr><td colSpan={7} className="p-12 text-center text-sm text-muted-foreground">No transfers yet.</td></tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function NewTransferDialog({ recipients }: { recipients: WiseRecipient[] }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [recipientId, setRecipientId] = useState("");
  const [sent, setSent] = useState("");
  const [fee, setFee] = useState("0");
  const [received, setReceived] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");

  const mut = useMutation({
    mutationFn: async () => {
      const rid = recipientId || recipients[0]?.id;
      if (!rid) throw new Error("Pick a recipient");
      const s = parseInt(sent, 10);
      const f = parseInt(fee || "0", 10);
      const r = parseFloat(received);
      if (!Number.isFinite(s) || s <= 0) throw new Error("Enter amount sent");
      if (!Number.isFinite(r) || r < 0) throw new Error("Enter INR received");
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");
      const { error } = await (supabase as any).from("wise_transfers").insert({
        user_id: user.id,
        recipient_id: rid,
        amount_sent_yen: s,
        charge_yen: f,
        inr_received: r,
        transfer_date: date,
        note: note || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Transfer logged");
      qc.invalidateQueries({ queryKey: ["wise_transfers"] });
      qc.invalidateQueries({ queryKey: ["accounts"] });
      setOpen(false);
      setSent(""); setReceived(""); setFee("0"); setNote("");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const sentN = parseInt(sent || "0", 10) || 0;
  const feeN = parseInt(fee || "0", 10) || 0;
  const recvN = parseFloat(received || "0") || 0;
  const netSent = Math.max(0, sentN - feeN);
  const rate = netSent > 0 && recvN > 0 ? (recvN / netSent).toFixed(4) : null;


  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2"><Plus className="size-4" /> New transfer</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle className="font-display">Log Wise transfer</DialogTitle></DialogHeader>
        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Recipient</Label>
              <Select value={recipientId || recipients[0]?.id} onValueChange={setRecipientId}>
                <SelectTrigger><SelectValue placeholder="Pick" /></SelectTrigger>
                <SelectContent>
                  {recipients.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label>Sent (¥)</Label>
              <Input inputMode="numeric" value={sent} onChange={(e) => setSent(e.target.value.replace(/[^\d]/g, ""))} placeholder="100000" />
            </div>
            <div className="space-y-2">
              <Label>Fee (¥)</Label>
              <Input inputMode="numeric" value={fee} onChange={(e) => setFee(e.target.value.replace(/[^\d]/g, ""))} placeholder="500" />
            </div>
            <div className="space-y-2">
              <Label>Received (₹)</Label>
              <Input inputMode="decimal" value={received} onChange={(e) => setReceived(e.target.value.replace(/[^\d.]/g, ""))} placeholder="56000" />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Note</Label>
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Monthly support" />
          </div>
          {rate && (
            <p className="font-mono text-xs text-muted-foreground">
              Rate: ₹{rate} per ¥ (on net {yen(netSent)} after {yen(feeN)} fee) · Total debit from Wise: {yen(sentN + feeN)}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending}>{mut.isPending ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
