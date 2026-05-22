export const yen = (n: number | null | undefined) =>
  n == null ? "—" : `¥${Math.round(n).toLocaleString("ja-JP")}`;

export const monthLabel = (d: Date) =>
  d.toLocaleDateString("en-US", { month: "long", year: "numeric" });

export const dateLabel = (s: string | Date) =>
  new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

export const inr = (n: number | null | undefined) =>
  n == null ? "—" : `₹${Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

// Per-account category sets (base categories per bank type)
export const CATEGORIES_BY_BANK: Record<string, string[]> = {
  aichi: ["sim", "gym", "other"],
  rakuten: ["aeon", "daiso", "dinner", "groceries", "transit", "shopping", "other"],
  wise: ["mom", "dad", "bro", "self", "others"],
  paypay: ["groceries", "dining", "shopping", "transit", "entertainment", "other"],
  paypay_credit: ["groceries", "dining", "shopping", "transit", "entertainment", "other"],
  cash: ["food", "transit", "shopping", "entertainment", "misc", "other"],
  custom: ["groceries", "dining", "shopping", "transit", "entertainment", "sim", "gym", "other"],
};

export const DEFAULT_CATEGORIES = ["groceries", "dining", "shopping", "transit", "entertainment", "other"];

export const CATEGORIES = Array.from(
  new Set(Object.values(CATEGORIES_BY_BANK).flat()),
) as readonly string[];

export type Category = string;

export function categoriesFor(bankType?: string | null): string[] {
  if (!bankType) return DEFAULT_CATEGORIES;
  return CATEGORIES_BY_BANK[bankType] ?? DEFAULT_CATEGORIES;
}

// Wise recipient categories (used to display transfers in wise log)
export const WISE_RECIPIENT_CATEGORIES = new Set(["mom", "dad", "bro", "self", "others", "preethu"]);

// Build the full list of categories shown in the dialog for a given account,
// including transfer-to-other-account options (any bank type except paypay_credit).
export type AcctLite = { id: string; name: string; bank_type: string };

export function categoriesForWithTransfers(acct: AcctLite | undefined, allAccounts: AcctLite[]): string[] {
  if (!acct) return DEFAULT_CATEGORIES;
  const base = categoriesFor(acct.bank_type);
  // paypay_credit is debt; no transfers from/to it via category
  if (acct.bank_type === "paypay_credit") return base;
  const transferTargets = allAccounts
    .filter((a) => a.id !== acct.id && a.bank_type !== "paypay_credit")
    .map((a) => a.name.toLowerCase());
  // Always allow wise recipients if there is a wise account
  const hasWise = allAccounts.some((a) => a.bank_type === "wise");
  const recipients = hasWise ? ["mom", "dad", "bro", "self", "others"] : [];
  return Array.from(new Set([...transferTargets, ...recipients, ...base]));
}

// True if logging this category from this account would trigger a transfer
export function isTransferCategory(acct: AcctLite | undefined, category: string, allAccounts: AcctLite[]): boolean {
  if (!acct || acct.bank_type === "paypay_credit") return false;
  const c = category.toLowerCase();
  if (WISE_RECIPIENT_CATEGORIES.has(c) || c === "wise") return true;
  return allAccounts.some(
    (a) => a.id !== acct.id && a.bank_type !== "paypay_credit" && a.name.toLowerCase() === c,
  );
}

// Japan public holidays 2026 & 2027 (YYYY-MM-DD)
export const JP_HOLIDAYS = new Set<string>([
  "2026-01-01","2026-01-12","2026-02-11","2026-02-23","2026-03-20","2026-04-29",
  "2026-05-03","2026-05-04","2026-05-05","2026-05-06","2026-07-20","2026-08-11",
  "2026-09-21","2026-09-22","2026-09-23","2026-10-12","2026-11-03","2026-11-23",
  "2027-01-01","2027-01-11","2027-02-11","2027-02-23","2027-03-21","2027-03-22",
  "2027-04-29","2027-05-03","2027-05-04","2027-05-05","2027-07-19","2027-08-11",
  "2027-09-20","2027-09-23","2027-10-11","2027-11-03","2027-11-23",
]);

function iso(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function isWorkingDay(d: Date): boolean {
  const day = d.getDay();
  if (day === 0 || day === 6) return false;
  return !JP_HOLIDAYS.has(iso(d));
}

export function prevWorkingDay(d: Date): Date {
  const r = new Date(d);
  while (!isWorkingDay(r)) r.setDate(r.getDate() - 1);
  return r;
}

export function countWorkingDays(start: Date, end: Date): number {
  let n = 0;
  const d = new Date(start);
  while (d <= end) {
    if (isWorkingDay(d)) n++;
    d.setDate(d.getDate() + 1);
  }
  return n;
}

// PayPay Credit: spend in month M → billed on the 28th of M+1, shift to prev working day
export function paypayBillDate(spendDate: Date | string): Date {
  const d = new Date(spendDate);
  const bill = new Date(d.getFullYear(), d.getMonth() + 1, 28);
  return prevWorkingDay(bill);
}

export function billMonthKey(spendDate: Date | string): string {
  const b = paypayBillDate(spendDate);
  return `${b.getFullYear()}-${String(b.getMonth() + 1).padStart(2, "0")}`;
}

// A settlement paid between the 15th and 20th of bill-month M counts toward bill M
export function settlementBillKey(payDate: Date | string): string | null {
  const d = new Date(payDate);
  const day = d.getDate();
  if (day < 15 || day > 20) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// Salary period: 16th of (payMonth - 1) → 15th of payMonth, paid on 28th (or prev working day)
export function salaryPeriod(payMonth: Date) {
  const y = payMonth.getFullYear();
  const m = payMonth.getMonth();
  const start = new Date(y, m - 1, 16);
  const end = new Date(y, m, 15);
  const payDate = prevWorkingDay(new Date(y, m, 28));
  return { start, end, payDate, workingDays: countWorkingDays(start, end) };
}

export const isoDate = iso;
