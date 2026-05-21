import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { getSalaryEntries, type SalaryEntry } from "@/lib/db";
import { yen, dateLabel, salaryPeriod, isoDate } from "@/lib/format";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Trash2, Gift } from "lucide-react";

export const Route = createFileRoute("/salary")({
  head: () => ({ meta: [{ title: "Salary — Chōbo" }] }),
  component: () => <AppShell><SalaryPage /></AppShell>,
});

function computeNet(i: {
  base_pay: number; overtime_pay: number;
  health_insurance: number; pension: number; employment_insurance: number;
  tax: number;
  lunch_days: number; lunch_per_day: number; dorm: number; fixed_deduction: number;
  extra_additions: number; extra_deductions: number;
}) {
  const gross = i.base_pay + i.overtime_pay;
  const afterSocial = gross - i.health_insurance - i.pension - i.employment_insurance;
  const afterTax = afterSocial - i.tax;
  const lunch = i.lunch_days * i.lunch_per_day;
  return afterTax - lunch - i.dorm - i.fixed_deduction + i.extra_additions - i.extra_deductions;
}

function SalaryPage() {
  const qc = useQueryClient();
  const entries = useQuery({ queryKey: ["salary"], queryFn: getSalaryEntries });
  const [detail, setDetail] = useState<SalaryEntry | null>(null);

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("salary_entries").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["salary"] });
      qc.invalidateQueries({ queryKey: ["accounts"] });
      toast.success("Deleted");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const yearly = useMemo(() => {
    const m = new Map<string, { health: number; pension: number; employment: number; tax: number; net: number; entries: number; bonus: number }>();
    for (const e of entries.data ?? []) {
      const y = e.pay_date.slice(0, 4);
      const cur = m.get(y) ?? { health: 0, pension: 0, employment: 0, tax: 0, net: 0, entries: 0, bonus: 0 };
      cur.health += e.health_insurance;
      cur.pension += e.pension;
      cur.employment += e.employment_insurance;
      cur.tax += e.tax;
      cur.net += e.net_yen;
      cur.entries += 1;
      if (e.is_bonus) cur.bonus += e.net_yen;
      m.set(y, cur);
    }
    return Array.from(m.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [entries.data]);

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-muted-foreground">Income</p>
          <h1 className="font-display text-5xl font-bold tracking-tight mt-1">Salary</h1>
        </div>
        <div className="flex gap-2">
          <NewSalaryDialog bonus />
          <NewSalaryDialog />
        </div>
      </header>

      <section className="rounded-lg border border-border bg-card shadow-paper overflow-hidden">
        <div className="p-4 border-b border-border flex justify-between items-center">
          <h2 className="font-display text-xl font-bold">Pay slips</h2>
          <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{entries.data?.length ?? 0}</span>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-paper-mute/60 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            <tr>
              <th className="text-left p-3">Pay date</th>
              <th className="text-left p-3">Type</th>
              <th className="text-left p-3">Period</th>
              <th className="text-right p-3">Base+OT</th>
              <th className="text-right p-3">Deductions</th>
              <th className="text-right p-3">Tax</th>
              <th className="text-right p-3">Net</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {(entries.data ?? []).map((e) => {
              const deductions = e.health_insurance + e.pension + e.employment_insurance + e.lunch_days * e.lunch_per_day + e.dorm + e.fixed_deduction + e.extra_deductions;
              return (
                <tr key={e.id} className="border-t border-border hover:bg-paper-mute/40 cursor-pointer" onClick={() => setDetail(e)}>
                  <td className="p-3 font-mono text-xs">{dateLabel(e.pay_date)}</td>
                  <td className="p-3 text-xs">
                    {e.is_bonus
                      ? <span className="font-mono uppercase tracking-widest text-[10px] bg-foreground text-background px-1.5 py-0.5 rounded">Bonus</span>
                      : <span className="font-mono uppercase tracking-widest text-[10px] text-muted-foreground">Salary</span>}
                  </td>
                  <td className="p-3 font-mono text-xs text-muted-foreground">{dateLabel(e.period_start)} → {dateLabel(e.period_end)}</td>
                  <td className="p-3 text-right font-mono tabular-nums">{yen(e.base_pay + e.overtime_pay)}</td>
                  <td className="p-3 text-right font-mono tabular-nums text-muted-foreground">{yen(deductions)}</td>
                  <td className="p-3 text-right font-mono tabular-nums text-muted-foreground">{yen(e.tax)}</td>
                  <td className="p-3 text-right font-mono tabular-nums font-semibold">{yen(e.net_yen)}</td>
                  <td className="p-3 text-right" onClick={(ev) => ev.stopPropagation()}>
                    <Button size="icon" variant="ghost" onClick={() => del.mutate(e.id)} aria-label="Delete">
                      <Trash2 className="size-4" />
                    </Button>
                  </td>
                </tr>
              );
            })}
            {(entries.data ?? []).length === 0 && (
              <tr><td colSpan={8} className="p-12 text-center text-sm text-muted-foreground">No salary entries yet.</td></tr>
            )}
          </tbody>
        </table>
      </section>

      {yearly.length > 0 && (
        <section className="rounded-lg border border-border bg-card shadow-paper p-6">
          <h2 className="font-display text-xl font-bold mb-4">Yearly summary</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {yearly.map(([year, y]) => (
              <div key={year} className="rounded-md border border-dashed border-foreground/20 p-4">
                <div className="flex items-baseline justify-between">
                  <h3 className="font-display text-2xl font-bold">{year}</h3>
                  <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{y.entries} slips</span>
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-y-1 font-mono text-xs">
                  <dt className="text-muted-foreground">Health insurance</dt><dd className="text-right tabular-nums">{yen(y.health)}</dd>
                  <dt className="text-muted-foreground">Pension</dt><dd className="text-right tabular-nums">{yen(y.pension)}</dd>
                  <dt className="text-muted-foreground">Employment insurance</dt><dd className="text-right tabular-nums">{yen(y.employment)}</dd>
                  <dt className="text-muted-foreground">Tax</dt><dd className="text-right tabular-nums">{yen(y.tax)}</dd>
                  <dt className="text-muted-foreground">Bonus net</dt><dd className="text-right tabular-nums">{yen(y.bonus)}</dd>
                  <dt className="pt-2 border-t border-dashed border-foreground/20 mt-2 font-semibold text-foreground">Net to Aichi</dt>
                  <dd className="pt-2 border-t border-dashed border-foreground/20 mt-2 text-right tabular-nums font-semibold">{yen(y.net)}</dd>
                </dl>
              </div>
            ))}
          </div>
        </section>
      )}

      <Dialog open={!!detail} onOpenChange={(v) => !v && setDetail(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle className="font-display">{detail && dateLabel(detail.pay_date)} — {detail?.is_bonus ? "bonus" : "slip"} detail</DialogTitle></DialogHeader>
          {detail && (
            <dl className="grid grid-cols-2 gap-y-1.5 font-mono text-xs">
              <dt className="text-muted-foreground">Period</dt><dd className="text-right">{dateLabel(detail.period_start)} → {dateLabel(detail.period_end)}</dd>
              <dt className="text-muted-foreground">Working days</dt><dd className="text-right tabular-nums">{detail.working_days}</dd>
              <dt className="text-muted-foreground">Base pay</dt><dd className="text-right tabular-nums">{yen(detail.base_pay)}</dd>
              <dt className="text-muted-foreground">Overtime</dt><dd className="text-right tabular-nums">{yen(detail.overtime_pay)}</dd>
              <dt className="pt-2 border-t border-dashed border-foreground/20 mt-2 text-muted-foreground">Health ins.</dt><dd className="pt-2 border-t border-dashed border-foreground/20 mt-2 text-right tabular-nums">−{yen(detail.health_insurance)}</dd>
              <dt className="text-muted-foreground">Pension</dt><dd className="text-right tabular-nums">−{yen(detail.pension)}</dd>
              <dt className="text-muted-foreground">Employment ins.</dt><dd className="text-right tabular-nums">−{yen(detail.employment_insurance)}</dd>
              <dt className="text-muted-foreground">Tax</dt><dd className="text-right tabular-nums">−{yen(detail.tax)}</dd>
              {!detail.is_bonus && <>
                <dt className="text-muted-foreground">Lunch ({detail.lunch_days} × ¥{detail.lunch_per_day})</dt><dd className="text-right tabular-nums">−{yen(detail.lunch_days * detail.lunch_per_day)}</dd>
                <dt className="text-muted-foreground">Dorm</dt><dd className="text-right tabular-nums">−{yen(detail.dorm)}</dd>
                <dt className="text-muted-foreground">Other (100+640)</dt><dd className="text-right tabular-nums">−{yen(detail.fixed_deduction)}</dd>
              </>}
              {detail.extra_additions > 0 && <>
                <dt className="text-emerald-700">Extra additions</dt><dd className="text-right tabular-nums text-emerald-700">+{yen(detail.extra_additions)}</dd>
              </>}
              {detail.extra_deductions > 0 && <>
                <dt className="text-muted-foreground">Extra deductions</dt><dd className="text-right tabular-nums">−{yen(detail.extra_deductions)}</dd>
              </>}
              {detail.extras_note && (<><dt className="text-muted-foreground">Extras note</dt><dd className="text-right">{detail.extras_note}</dd></>)}
              <dt className="pt-2 border-t border-foreground/30 mt-2 font-semibold text-foreground">Net to Aichi</dt>
              <dd className="pt-2 border-t border-foreground/30 mt-2 text-right tabular-nums font-semibold">{yen(detail.net_yen)}</dd>
              {detail.note && (<><dt className="text-muted-foreground mt-2">Note</dt><dd className="text-right mt-2">{detail.note}</dd></>)}
            </dl>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function NewSalaryDialog({ bonus = false }: { bonus?: boolean }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const now = new Date();
  const defaultPeriod = salaryPeriod(now);

  const [payMonth, setPayMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  const [workingDays, setWorkingDays] = useState(defaultPeriod.workingDays.toString());
  const [basePay, setBasePay] = useState("");
  const [overtimePay, setOvertimePay] = useState("0");
  const [health, setHealth] = useState("");
  const [pension, setPension] = useState("");
  const [employment, setEmployment] = useState("");
  const [tax, setTax] = useState("");
  const [lunchDays, setLunchDays] = useState("0");
  const [dorm, setDorm] = useState(bonus ? "0" : "20000");
  const [fixed, setFixed] = useState(bonus ? "0" : "740");
  const [extraAdd, setExtraAdd] = useState("0");
  const [extraDed, setExtraDed] = useState("0");
  const [extrasNote, setExtrasNote] = useState("");
  const [note, setNote] = useState("");

  const period = useMemo(() => {
    const [y, m] = payMonth.split("-").map((n) => parseInt(n, 10));
    return salaryPeriod(new Date(y, m - 1, 1));
  }, [payMonth]);

  useEffect(() => { if (!bonus) setWorkingDays(period.workingDays.toString()); }, [period.workingDays, bonus]);

  const parsed = {
    base_pay: parseInt(basePay || "0", 10) || 0,
    overtime_pay: parseInt(overtimePay || "0", 10) || 0,
    health_insurance: parseInt(health || "0", 10) || 0,
    pension: parseInt(pension || "0", 10) || 0,
    employment_insurance: parseInt(employment || "0", 10) || 0,
    tax: parseInt(tax || "0", 10) || 0,
    lunch_days: parseInt(lunchDays || "0", 10) || 0,
    lunch_per_day: bonus ? 0 : 251,
    dorm: parseInt(dorm || "0", 10) || 0,
    fixed_deduction: parseInt(fixed || "0", 10) || 0,
    extra_additions: parseInt(extraAdd || "0", 10) || 0,
    extra_deductions: parseInt(extraDed || "0", 10) || 0,
  };
  const net = computeNet(parsed);

  const mut = useMutation({
    mutationFn: async () => {
      if (parsed.base_pay <= 0 && parsed.overtime_pay <= 0 && parsed.extra_additions <= 0) {
        throw new Error("Enter at least one amount");
      }
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");
      const row = {
        user_id: user.id,
        pay_date: isoDate(period.payDate),
        period_start: isoDate(period.start),
        period_end: isoDate(period.end),
        working_days: parseInt(workingDays || "0", 10) || 0,
        ...parsed,
        is_bonus: bonus,
        extras_note: extrasNote || null,
        net_yen: net,
        note: note || null,
      };
      const { error } = await (supabase as any).from("salary_entries").insert(row);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(`${bonus ? "Bonus" : "Salary"} logged · ${yen(net)} added to Aichi`);
      qc.invalidateQueries({ queryKey: ["salary"] });
      qc.invalidateQueries({ queryKey: ["accounts"] });
      setOpen(false);
      setBasePay(""); setOvertimePay("0"); setHealth(""); setPension(""); setEmployment(""); setTax(""); setLunchDays("0"); setNote("");
      setExtraAdd("0"); setExtraDed("0"); setExtrasNote("");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={bonus ? "outline" : "default"} className="gap-2">
          {bonus ? <Gift className="size-4" /> : <Plus className="size-4" />}
          {bonus ? "Add bonus" : "Add salary"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="font-display">New {bonus ? "bonus" : "pay slip"}</DialogTitle></DialogHeader>
        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Pay month">
              <Input type="month" value={payMonth} onChange={(e) => setPayMonth(e.target.value)} />
            </Field>
            <Field label={bonus ? "Working days" : "Working days (auto)"}>
              <Input inputMode="numeric" value={workingDays} onChange={(e) => setWorkingDays(e.target.value.replace(/[^\d]/g, ""))} />
            </Field>
          </div>
          <p className="font-mono text-[11px] text-muted-foreground -mt-2">
            Period {dateLabel(period.start)} → {dateLabel(period.end)} · Pay date {dateLabel(period.payDate)}
          </p>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Base pay (¥)"><MoneyInput value={basePay} onChange={setBasePay} /></Field>
            <Field label="Overtime / bonus base (¥)"><MoneyInput value={overtimePay} onChange={setOvertimePay} /></Field>
          </div>

          <div className="border-t border-dashed border-foreground/20 pt-3">
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Pre-tax deductions</p>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Health ins."><MoneyInput value={health} onChange={setHealth} /></Field>
              <Field label="Pension"><MoneyInput value={pension} onChange={setPension} /></Field>
              <Field label="Employment ins."><MoneyInput value={employment} onChange={setEmployment} /></Field>
            </div>
          </div>

          <Field label="Tax (¥)">
            <MoneyInput value={tax} onChange={setTax} />
          </Field>

          {!bonus && (
            <div className="border-t border-dashed border-foreground/20 pt-3">
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Post-tax deductions</p>
              <div className="grid grid-cols-3 gap-3">
                <Field label="Lunch days × ¥251">
                  <Input inputMode="numeric" value={lunchDays} onChange={(e) => setLunchDays(e.target.value.replace(/[^\d]/g, ""))} />
                </Field>
                <Field label="Dorm (¥)"><MoneyInput value={dorm} onChange={setDorm} /></Field>
                <Field label="Fixed (100+640)"><MoneyInput value={fixed} onChange={setFixed} /></Field>
              </div>
            </div>
          )}

          <div className="border-t border-dashed border-foreground/20 pt-3">
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Extras (anything not above)</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Extra additions (+¥)"><MoneyInput value={extraAdd} onChange={setExtraAdd} /></Field>
              <Field label="Extra deductions (−¥)"><MoneyInput value={extraDed} onChange={setExtraDed} /></Field>
            </div>
            <div className="mt-2">
              <Field label="Extras note (what is it?)">
                <Input value={extrasNote} onChange={(e) => setExtrasNote(e.target.value)} placeholder="e.g. travel allowance + parking fee" />
              </Field>
            </div>
          </div>

          <Field label="Note (optional)">
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>

          <div className="rounded-md border-2 border-dashed border-foreground/40 bg-paper-mute/60 p-4">
            <div className="flex justify-between font-mono text-xs">
              <span className="text-muted-foreground">Gross</span>
              <span className="tabular-nums">{yen(parsed.base_pay + parsed.overtime_pay)}</span>
            </div>
            <div className="flex justify-between font-mono text-xs">
              <span className="text-muted-foreground">− Social ins.</span>
              <span className="tabular-nums">−{yen(parsed.health_insurance + parsed.pension + parsed.employment_insurance)}</span>
            </div>
            <div className="flex justify-between font-mono text-xs">
              <span className="text-muted-foreground">− Tax</span>
              <span className="tabular-nums">−{yen(parsed.tax)}</span>
            </div>
            {!bonus && (
              <div className="flex justify-between font-mono text-xs">
                <span className="text-muted-foreground">− Lunch + Dorm + Fixed</span>
                <span className="tabular-nums">−{yen(parsed.lunch_days * 251 + parsed.dorm + parsed.fixed_deduction)}</span>
              </div>
            )}
            {parsed.extra_additions > 0 && (
              <div className="flex justify-between font-mono text-xs text-emerald-700">
                <span>+ Extras</span><span className="tabular-nums">+{yen(parsed.extra_additions)}</span>
              </div>
            )}
            {parsed.extra_deductions > 0 && (
              <div className="flex justify-between font-mono text-xs">
                <span className="text-muted-foreground">− Extras</span><span className="tabular-nums">−{yen(parsed.extra_deductions)}</span>
              </div>
            )}
            <div className="flex justify-between font-display text-2xl font-bold mt-2 pt-2 border-t border-foreground/30">
              <span>Net to Aichi</span>
              <span className="tabular-nums">{yen(net)}</span>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending}>{mut.isPending ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

function MoneyInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Input
      inputMode="numeric"
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, ""))}
      placeholder="0"
    />
  );
}
