import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { categoriesFor, yen, AICHI_TRANSFER_CATEGORIES } from "@/lib/format";
import { getAccounts, type Account } from "@/lib/db";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus } from "lucide-react";

type Props = {
  trigger?: React.ReactNode;
  defaults?: {
    amount_yen?: number;
    account_id?: string;
    receipt_id?: string;
    description?: string;
    category?: string;
    expense_date?: string;
  };
  lockAccount?: boolean;
  onCreated?: () => void;
};

export function NewExpenseDialog({ trigger, defaults, lockAccount, onCreated }: Props) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data: accounts } = useQuery({ queryKey: ["accounts"], queryFn: getAccounts });

  const [amount, setAmount] = useState(defaults?.amount_yen?.toString() ?? "");
  const [accountId, setAccountId] = useState(defaults?.account_id ?? "");
  const [category, setCategory] = useState(defaults?.category ?? "");
  const [description, setDescription] = useState(defaults?.description ?? "");
  const [date, setDate] = useState(defaults?.expense_date ?? new Date().toISOString().slice(0, 10));
  const [charge, setCharge] = useState("0");
  const [paymentMethod, setPaymentMethod] = useState<"debit" | "credit">("debit");

  const acct = useMemo<Account | undefined>(
    () => (accounts ?? []).find((a) => a.id === (accountId || accounts?.[0]?.id)),
    [accounts, accountId],
  );

  const cats = categoriesFor(acct?.bank_type);
  const currentCategory = category || cats[0] || "other";
  const isAichiTransfer = acct?.bank_type === "aichi" && AICHI_TRANSFER_CATEGORIES.has(currentCategory);
  const showCharge = acct?.bank_type === "aichi" && (currentCategory === "rakuten" || currentCategory === "wise");
  const isCreditAccount = acct?.bank_type === "paypay_credit";
  const effectiveMethod = isCreditAccount ? "credit" : paymentMethod;

  const mut = useMutation({
    mutationFn: async () => {
      const a = acct;
      if (!a) throw new Error("No account selected");
      const amt = parseInt(amount, 10);
      if (!Number.isFinite(amt) || amt <= 0) throw new Error("Enter a positive amount");
      const fee = showCharge ? Math.max(0, parseInt(charge || "0", 10) || 0) : 0;
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");
      const { error } = await supabase.from("expenses").insert({
        user_id: user.id,
        account_id: a.id,
        receipt_id: defaults?.receipt_id ?? null,
        amount_yen: amt,
        charge_yen: fee,
        payment_method: effectiveMethod,
        category: currentCategory,
        description: description || null,
        expense_date: date,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(isAichiTransfer ? "Logged & balance transferred" : "Expense logged");
      qc.invalidateQueries({ queryKey: ["expenses"] });
      qc.invalidateQueries({ queryKey: ["accounts"] });
      setOpen(false);
      setAmount(""); setDescription(""); setCharge("0");
      onCreated?.();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button className="gap-2"><Plus className="size-4" /> Log expense</Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle className="font-display">Log an expense</DialogTitle></DialogHeader>
        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Amount (¥)</Label>
              <Input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ""))} placeholder="1200" />
            </div>
            <div className="space-y-2">
              <Label>Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Account</Label>
              <Select
                value={accountId || accounts?.[0]?.id}
                onValueChange={(v) => { setAccountId(v); setCategory(""); }}
                disabled={lockAccount}
              >
                <SelectTrigger><SelectValue placeholder="Choose account" /></SelectTrigger>
                <SelectContent>
                  {(accounts as Account[] | undefined)?.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={currentCategory} onValueChange={setCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {cats.map((c) => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          {showCharge && (
            <div className="space-y-2 rounded-md border border-dashed border-foreground/30 bg-paper-mute/40 p-3">
              <Label className="text-xs uppercase tracking-widest font-mono">Transfer charge (¥)</Label>
              <Input inputMode="numeric" value={charge} onChange={(e) => setCharge(e.target.value.replace(/[^\d]/g, ""))} placeholder="0" />
              <p className="font-mono text-[10px] text-muted-foreground">
                Aichi will be debited {yen((parseInt(amount || "0", 10) || 0) + (parseInt(charge || "0", 10) || 0))} ·
                {" "}{currentCategory === "rakuten" ? "Rakuten" : "Wise"} credited {yen(parseInt(amount || "0", 10) || 0)}
              </p>
            </div>
          )}
          {!isCreditAccount && (
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-widest font-mono">Payment method</Label>
              <div className="flex gap-2">
                {(["debit", "credit"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setPaymentMethod(m)}
                    className={`flex-1 rounded-md border px-3 py-2 text-sm capitalize transition ${
                      paymentMethod === m
                        ? "border-foreground bg-foreground text-background"
                        : "border-border bg-card hover:bg-paper-mute"
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="space-y-2">
            <Label>Note</Label>
            <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Lunch at the soba place" />
          </div>
          {amount && <p className="font-mono text-xs text-muted-foreground">Preview: {yen(parseInt(amount, 10))} · {effectiveMethod}</p>}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending}>{mut.isPending ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
