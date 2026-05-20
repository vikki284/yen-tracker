import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { type Expense, updateExpenseMeta } from "@/lib/db";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

export function EditExpenseDialog({ expense, open, onOpenChange }: {
  expense: Expense | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const [description, setDescription] = useState(expense?.description ?? "");
  const [date, setDate] = useState(expense?.expense_date ?? "");

  // sync when expense changes
  if (expense && expense.id !== (lastIdRef.id ?? "")) {
    lastIdRef.id = expense.id;
    setDescription(expense.description ?? "");
    setDate(expense.expense_date);
  }

  const mut = useMutation({
    mutationFn: async () => {
      if (!expense) return;
      await updateExpenseMeta(expense.id, { description: description || null, expense_date: date });
    },
    onSuccess: () => {
      toast.success("Updated");
      qc.invalidateQueries({ queryKey: ["expenses"] });
      onOpenChange(false);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  if (!expense) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-display">Edit entry</DialogTitle>
        </DialogHeader>
        <p className="font-mono text-[11px] text-muted-foreground -mt-2">
          Only note & date can be edited. To change amount, category or method — delete and re-create.
        </p>
        <div className="grid gap-4 mt-2">
          <div className="space-y-2">
            <Label>Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Note</Label>
            <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending}>{mut.isPending ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const lastIdRef: { id: string | null } = { id: null };
