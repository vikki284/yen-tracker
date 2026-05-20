import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Check } from "lucide-react";
import { yen } from "@/lib/format";

export function SettleUpDialog({ paypayAccountId, suggested }: { paypayAccountId: string; suggested?: number }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(suggested ? String(suggested) : "");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");

  const mut = useMutation({
    mutationFn: async () => {
      const amt = parseInt(amount, 10);
      if (!Number.isFinite(amt) || amt <= 0) throw new Error("Enter amount paid");
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");
      const { error } = await supabase.from("expenses").insert({
        user_id: user.id,
        account_id: paypayAccountId,
        amount_yen: amt,
        payment_method: "credit",
        category: "settle_up",
        description: note || "PayPay settle-up",
        expense_date: date,
        is_settlement: true,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(`Settled ${yen(parseInt(amount, 10))} · Aichi debited`);
      qc.invalidateQueries({ queryKey: ["expenses"] });
      qc.invalidateQueries({ queryKey: ["accounts"] });
      setOpen(false);
      setAmount(""); setNote("");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2"><Check className="size-4" /> Settle up</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle className="font-display">Pay PayPay bill</DialogTitle></DialogHeader>
        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Amount paid (¥)</Label>
              <Input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ""))} />
            </div>
            <div className="space-y-2">
              <Label>Paid on</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Note (optional)</Label>
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="May bill" />
          </div>
          <p className="font-mono text-[11px] text-muted-foreground">
            PayPay owed: − {yen(parseInt(amount || "0", 10) || 0)} · Aichi: − {yen(parseInt(amount || "0", 10) || 0)} (auto)
          </p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending}>{mut.isPending ? "Saving…" : "Confirm"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
