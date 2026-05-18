import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { CATEGORIES, yen } from "@/lib/format";
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
  defaults?: { amount_yen?: number; account_id?: string; receipt_id?: string; description?: string; category?: string; expense_date?: string };
  onCreated?: () => void;
};

export function NewExpenseDialog({ trigger, defaults, onCreated }: Props) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data: accounts } = useQuery({ queryKey: ["accounts"], queryFn: getAccounts });

  const [amount, setAmount] = useState(defaults?.amount_yen?.toString() ?? "");
  const [accountId, setAccountId] = useState(defaults?.account_id ?? "");
  const [category, setCategory] = useState(defaults?.category ?? "other");
  const [description, setDescription] = useState(defaults?.description ?? "");
  const [date, setDate] = useState(defaults?.expense_date ?? new Date().toISOString().slice(0, 10));

  const mut = useMutation({
    mutationFn: async () => {
      const acct = accountId || accounts?.[0]?.id;
      if (!acct) throw new Error("No account selected");
      const amt = parseInt(amount, 10);
      if (!Number.isFinite(amt) || amt <= 0) throw new Error("Enter a positive amount");
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");
      const { error } = await supabase.from("expenses").insert({
        user_id: user.id,
        account_id: acct,
        receipt_id: defaults?.receipt_id ?? null,
        amount_yen: amt,
        category, description: description || null,
        expense_date: date,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Expense logged");
      qc.invalidateQueries({ queryKey: ["expenses"] });
      setOpen(false);
      setAmount(""); setDescription("");
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
              <Select value={accountId || accounts?.[0]?.id} onValueChange={setAccountId}>
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
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Note</Label>
            <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Lunch at the soba place" />
          </div>
          {amount && <p className="font-mono text-xs text-muted-foreground">Preview: {yen(parseInt(amount, 10))}</p>}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending}>{mut.isPending ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
