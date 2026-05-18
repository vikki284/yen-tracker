import { useEffect, useState } from "react";
import { ChevronDown, FileText, Loader2, Plus, Sparkles } from "lucide-react";
import { yen, dateLabel } from "@/lib/format";
import { signedUrl, type Receipt } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { NewExpenseDialog } from "./NewExpenseDialog";

export function ReceiptCard({ receipt, onRescan, scanning }: { receipt: Receipt; onRescan: (id: string) => void; scanning: boolean }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (open && !url) signedUrl(receipt.image_path).then(setUrl);
  }, [open, url, receipt.image_path]);

  const isPending = receipt.status === "pending";

  return (
    <article className="rounded-lg border border-border bg-card shadow-paper overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-4 p-5 text-left hover:bg-paper-mute/40 transition"
      >
        <div className="flex items-center gap-4 min-w-0">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-md bg-paper-mute font-mono text-xs">
            <FileText className="size-5" />
          </div>
          <div className="min-w-0">
            <div className="font-display text-lg font-semibold truncate">
              {receipt.merchant ?? (isPending ? "Scanning…" : "Unknown merchant")}
            </div>
            <div className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
              {receipt.purchase_date ? dateLabel(receipt.purchase_date) : dateLabel(receipt.created_at)} · {receipt.items.length} items
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="font-mono text-lg tabular-nums">{yen(receipt.total_yen)}</div>
          <ChevronDown className={`size-4 transition ${open ? "rotate-180" : ""}`} />
        </div>
      </button>

      {open && (
        <div className="border-t border-border grid md:grid-cols-[1fr,1.2fr] gap-0">
          <div className="bg-paper-mute/40 p-5">
            {url ? (
              <img src={url} alt="Receipt" className="w-full rounded-md border border-border max-h-[480px] object-contain bg-white" />
            ) : (
              <div className="flex h-48 items-center justify-center text-xs text-muted-foreground">Loading image…</div>
            )}
          </div>
          <div className="p-5 receipt-paper">
            <div className="font-display text-center text-lg font-bold">{receipt.merchant ?? "Receipt"}</div>
            <div className="text-center font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              {receipt.purchase_date ?? dateLabel(receipt.created_at)}
            </div>
            <div className="my-4 border-t border-dashed border-foreground/30" />
            <ul className="space-y-1 font-mono text-sm">
              {receipt.items.length === 0 && (
                <li className="text-center text-muted-foreground italic text-xs">No items extracted yet.</li>
              )}
              {receipt.items.map((it, i) => (
                <li key={i} className="flex justify-between gap-3">
                  <span className="truncate">{it.qty && it.qty > 1 ? `${it.qty}× ` : ""}{it.name}</span>
                  <span className="tabular-nums">{yen(it.price ?? 0)}</span>
                </li>
              ))}
            </ul>
            <div className="my-4 border-t border-dashed border-foreground/30" />
            {receipt.tax_yen != null && (
              <div className="flex justify-between font-mono text-xs text-muted-foreground">
                <span>消費税 Tax</span><span className="tabular-nums">{yen(receipt.tax_yen)}</span>
              </div>
            )}
            <div className="flex justify-between font-mono text-base font-bold mt-1">
              <span>合計 TOTAL</span><span className="tabular-nums">{yen(receipt.total_yen)}</span>
            </div>

            <div className="mt-5 flex flex-wrap gap-2 justify-center">
              <Button size="sm" variant="outline" disabled={scanning} onClick={() => onRescan(receipt.id)} className="gap-1.5">
                {scanning ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
                {isPending ? "Scan" : "Re-scan"}
              </Button>
              <NewExpenseDialog
                trigger={<Button size="sm" className="gap-1.5"><Plus className="size-3.5" /> Log as expense</Button>}
                defaults={{
                  amount_yen: receipt.total_yen ?? undefined,
                  account_id: receipt.account_id ?? undefined,
                  receipt_id: receipt.id,
                  expense_date: receipt.purchase_date ?? undefined,
                  description: receipt.merchant ?? undefined,
                }}
              />
            </div>
          </div>
        </div>
      )}
    </article>
  );
}
