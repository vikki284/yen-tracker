import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/AppShell";
import { ReceiptCard } from "@/components/ReceiptCard";
import { getAccounts, getReceipts } from "@/lib/db";
import { supabase } from "@/integrations/supabase/client";
import { scanReceipt } from "@/lib/scan-receipt.functions";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Camera, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/receipts")({
  head: () => ({ meta: [{ title: "Receipts — Chōbo" }] }),
  component: () => <AppShell><ReceiptsPage /></AppShell>,
});

function ReceiptsPage() {
  const qc = useQueryClient();
  const accounts = useQuery({ queryKey: ["accounts"], queryFn: getAccounts });
  const receipts = useQuery({ queryKey: ["receipts"], queryFn: getReceipts });
  const [accountId, setAccountId] = useState<string>("");
  const [uploading, setUploading] = useState(false);
  const [scanningId, setScanningId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);
  const scanFn = useServerFn(scanReceipt);

  const scan = useMutation({
    mutationFn: async (receipt_id: string) => {
      setScanningId(receipt_id);
      return scanFn({ data: { receipt_id } });
    },
    onSuccess: () => { toast.success("Receipt scanned"); qc.invalidateQueries({ queryKey: ["receipts"] }); },
    onError: (e) => toast.error((e as Error).message),
    onSettled: () => setScanningId(null),
  });

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const acct = accountId || accounts.data?.[0]?.id;
    setUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");
      for (const file of Array.from(files)) {
        const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
        const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const up = await supabase.storage.from("receipts").upload(path, file, { contentType: file.type });
        if (up.error) throw up.error;
        const ins = await supabase.from("receipts").insert({
          user_id: user.id,
          account_id: acct ?? null,
          image_path: path,
          status: "pending",
        }).select("id").single();
        if (ins.error) throw ins.error;
        qc.invalidateQueries({ queryKey: ["receipts"] });
        // fire-and-await scan so user sees the items appear
        await scan.mutateAsync(ins.data.id);
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
      if (camRef.current) camRef.current.value = "";
    }
  };

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-muted-foreground">レシート</p>
          <h1 className="font-display text-5xl font-bold tracking-tight mt-1">Receipts</h1>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">Snap or upload a paper receipt. Items, totals, tax and date are extracted automatically.</p>
        </div>
      </header>

      <div className="rounded-lg border border-dashed border-foreground/30 bg-card p-6 shadow-paper">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-[180px]">
            <label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Charge to</label>
            <Select value={accountId || accounts.data?.[0]?.id} onValueChange={setAccountId}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Account" /></SelectTrigger>
              <SelectContent>
                {accounts.data?.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => handleFiles(e.target.files)} />
          <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => handleFiles(e.target.files)} />
          <Button onClick={() => camRef.current?.click()} disabled={uploading} className="gap-2">
            {uploading ? <Loader2 className="size-4 animate-spin" /> : <Camera className="size-4" />} Scan
          </Button>
          <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={uploading} className="gap-2">
            <Upload className="size-4" /> Upload
          </Button>
        </div>
        <p className="mt-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          OCR powered by Lovable AI · JPG/PNG · multiple files OK
        </p>
      </div>

      <div className="space-y-4">
        {receipts.data?.map((r) => (
          <ReceiptCard key={r.id} receipt={r} onRescan={(id) => scan.mutate(id)} scanning={scanningId === r.id} />
        ))}
        {receipts.data?.length === 0 && (
          <div className="rounded-lg border border-border bg-card p-12 text-center text-sm text-muted-foreground shadow-paper">
            No receipts yet — your first scan will land here.
          </div>
        )}
      </div>
    </div>
  );
}
