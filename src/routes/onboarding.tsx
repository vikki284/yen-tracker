import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";

export const Route = createFileRoute("/onboarding")({
  head: () => ({ meta: [{ title: "Set up — Yen Tracker" }] }),
  component: OnboardingPage,
});

type BankRow = { name: string; color: string };

const COLORS = ["#0d0d0d", "#bf0000", "#1f4f3f", "#37b88b", "#ff5577", "#c9a84c", "#3b3b6e", "#7a3a2a"];

function OnboardingPage() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [banks, setBanks] = useState<BankRow[]>([{ name: "Aichi Bank", color: COLORS[0] }]);
  const [cash, setCash] = useState("0");
  const [paypay, setPaypay] = useState("0");
  const [hasPaypayCredit, setHasPaypayCredit] = useState<"yes" | "no" | null>(null);
  const [creditLimit, setCreditLimit] = useState("300000");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && !session) navigate({ to: "/auth" });
  }, [loading, session, navigate]);

  // If already onboarded, redirect away
  useEffect(() => {
    if (!session) return;
    (async () => {
      const { data } = await supabase.from("profiles").select("onboarded").eq("id", session.user.id).maybeSingle();
      if ((data as any)?.onboarded) navigate({ to: "/" });
    })();
  }, [session, navigate]);

  const addBank = () => setBanks([...banks, { name: "", color: COLORS[banks.length % COLORS.length] }]);
  const removeBank = (i: number) => setBanks(banks.filter((_, k) => k !== i));
  const updateBank = (i: number, patch: Partial<BankRow>) =>
    setBanks(banks.map((b, k) => (k === i ? { ...b, ...patch } : b)));

  const finish = async () => {
    if (!session) return;
    setBusy(true);
    try {
      const userId = session.user.id;
      const rows: any[] = [];
      for (const b of banks) {
        const name = b.name.trim();
        if (!name) continue;
        const lower = name.toLowerCase();
        let bank_type = "custom";
        if (lower.includes("aichi")) bank_type = "aichi";
        else if (lower.includes("rakuten")) bank_type = "rakuten";
        rows.push({ user_id: userId, name, bank_type, color: b.color, credit_limit_yen: 0, opening_balance_yen: 0, balance_yen: 0 });
      }
      // Cash
      const cashN = parseInt(cash || "0", 10) || 0;
      rows.push({ user_id: userId, name: "Cash", bank_type: "cash", color: "#5c5c5c", credit_limit_yen: 0, opening_balance_yen: cashN, balance_yen: cashN });
      // PayPay
      const ppN = parseInt(paypay || "0", 10) || 0;
      rows.push({ user_id: userId, name: "PayPay", bank_type: "paypay", color: "#ff0033", credit_limit_yen: 0, opening_balance_yen: ppN, balance_yen: ppN });
      // PayPay Credit (optional)
      if (hasPaypayCredit === "yes") {
        const limit = parseInt(creditLimit || "0", 10) || 0;
        rows.push({ user_id: userId, name: "PayPay Credit", bank_type: "paypay_credit", color: "#ff5577", credit_limit_yen: limit, opening_balance_yen: 0, balance_yen: 0 });
      }

      const { error: insErr } = await supabase.from("accounts").insert(rows as any);
      if (insErr) throw insErr;

      const { error: profErr } = await supabase.from("profiles").update({ onboarded: true } as any).eq("id", userId);
      if (profErr) throw profErr;

      toast.success("All set! Welcome.");
      navigate({ to: "/" });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (loading || !session) {
    return <div className="min-h-screen flex items-center justify-center font-mono text-xs uppercase tracking-widest text-muted-foreground">Loading…</div>;
  }

  const stepCount = 4;
  const next = () => setStep((s) => Math.min(stepCount - 1, s + 1));
  const back = () => setStep((s) => Math.max(0, s - 1));

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-xl">
        <div className="mb-8 flex items-baseline justify-between">
          <h1 className="font-display text-3xl font-bold">¥ Yen Tracker</h1>
          <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Step {step + 1} / {stepCount}
          </span>
        </div>

        <div className="rounded-lg border border-border bg-card p-6 shadow-paper space-y-6">
          {step === 0 && (
            <div className="space-y-4">
              <div>
                <h2 className="font-display text-2xl font-semibold">Your bank accounts</h2>
                <p className="text-sm text-muted-foreground mt-1">Add the banks you actually use. You can rename them later.</p>
              </div>
              <div className="space-y-3">
                {banks.map((b, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      type="color"
                      value={b.color}
                      onChange={(e) => updateBank(i, { color: e.target.value })}
                      className="size-10 rounded border border-border bg-transparent"
                    />
                    <Input
                      value={b.name}
                      onChange={(e) => updateBank(i, { name: e.target.value })}
                      placeholder={`Bank ${i + 1}`}
                      className="flex-1"
                    />
                    {banks.length > 1 && (
                      <Button variant="ghost" size="icon" onClick={() => removeBank(i)}>
                        <Trash2 className="size-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
              {banks.length < 6 && (
                <Button variant="outline" onClick={addBank} className="gap-2 w-full">
                  <Plus className="size-4" /> Add another bank
                </Button>
              )}
              <p className="font-mono text-[10px] text-muted-foreground">
                Tip: name one of them "Aichi" or "Rakuten" if that's where you bank — special features will be enabled.
              </p>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <h2 className="font-display text-2xl font-semibold">Cash on hand</h2>
              <p className="text-sm text-muted-foreground">How much cash (¥) do you have right now?</p>
              <div className="space-y-2">
                <Label>Starting cash balance</Label>
                <Input inputMode="numeric" value={cash} onChange={(e) => setCash(e.target.value.replace(/[^\d]/g, ""))} placeholder="0" />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <h2 className="font-display text-2xl font-semibold">PayPay balance</h2>
              <p className="text-sm text-muted-foreground">How much do you have in PayPay right now?</p>
              <div className="space-y-2">
                <Label>Starting PayPay balance (¥)</Label>
                <Input inputMode="numeric" value={paypay} onChange={(e) => setPaypay(e.target.value.replace(/[^\d]/g, ""))} placeholder="0" />
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <h2 className="font-display text-2xl font-semibold">PayPay Credit</h2>
              <p className="text-sm text-muted-foreground">Do you have a PayPay Credit card?</p>
              <div className="flex gap-2">
                {(["yes", "no"] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setHasPaypayCredit(v)}
                    className={`flex-1 rounded-md border px-4 py-3 text-sm font-medium capitalize transition ${
                      hasPaypayCredit === v ? "border-foreground bg-foreground text-background" : "border-border bg-card hover:bg-paper-mute"
                    }`}
                  >
                    {v}
                  </button>
                ))}
              </div>
              {hasPaypayCredit === "yes" && (
                <div className="space-y-2">
                  <Label>Credit limit (¥)</Label>
                  <Input inputMode="numeric" value={creditLimit} onChange={(e) => setCreditLimit(e.target.value.replace(/[^\d]/g, ""))} placeholder="300000" />
                </div>
              )}
            </div>
          )}

          <div className="flex justify-between pt-2 border-t border-border">
            <Button variant="ghost" onClick={back} disabled={step === 0 || busy}>Back</Button>
            {step < stepCount - 1 ? (
              <Button onClick={next} disabled={(step === 0 && banks.every((b) => !b.name.trim()))}>Next</Button>
            ) : (
              <Button onClick={finish} disabled={busy || hasPaypayCredit === null}>
                {busy ? "Setting up…" : "Finish"}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
