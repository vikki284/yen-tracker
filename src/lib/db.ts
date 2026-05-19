import { supabase } from "@/integrations/supabase/client";

export type Account = {
  id: string;
  name: string;
  bank_type: string;
  color: string;
  balance_yen: number;
  credit_limit_yen: number;
};

export type Expense = {
  id: string;
  account_id: string;
  receipt_id: string | null;
  amount_yen: number;
  charge_yen: number;
  payment_method: string;
  category: string;
  description: string | null;
  expense_date: string;
  created_at: string;
};

export type ReceiptItem = { name: string; qty?: number; price?: number };

export type Receipt = {
  id: string;
  account_id: string | null;
  image_path: string;
  merchant: string | null;
  total_yen: number | null;
  tax_yen: number | null;
  purchase_date: string | null;
  items: ReceiptItem[];
  raw_text: string | null;
  status: string;
  created_at: string;
};

export async function getAccounts(): Promise<Account[]> {
  const { data, error } = await supabase.from("accounts").select("*").order("created_at");
  if (error) throw error;
  return (data as any[]).map((a) => ({ ...a, credit_limit_yen: a.credit_limit_yen ?? 0 })) as Account[];
}

export async function getExpenses(): Promise<Expense[]> {
  const { data, error } = await supabase.from("expenses").select("*").order("expense_date", { ascending: false }).limit(1000);
  if (error) throw error;
  return (data as any[]).map((e) => ({
    ...e,
    charge_yen: e.charge_yen ?? 0,
    payment_method: e.payment_method ?? "debit",
  })) as Expense[];
}

export async function getReceipts(): Promise<Receipt[]> {
  const { data, error } = await supabase.from("receipts").select("*").order("created_at", { ascending: false }).limit(200);
  if (error) throw error;
  return (data as any[]).map((r) => ({ ...r, items: Array.isArray(r.items) ? r.items : [] })) as Receipt[];
}

export async function signedUrl(path: string): Promise<string | null> {
  const { data } = await supabase.storage.from("receipts").createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}

export type WiseRecipient = {
  id: string;
  name: string;
  relation: string;
  min_yen: number;
  created_at: string;
};

export type WiseTransfer = {
  id: string;
  recipient_id: string;
  amount_sent_yen: number;
  charge_yen: number;
  inr_received: number;
  transfer_date: string;
  note: string | null;
  created_at: string;
};

export async function getWiseRecipients(): Promise<WiseRecipient[]> {
  const { data, error } = await (supabase as any).from("wise_recipients").select("*").order("created_at");
  if (error) throw error;
  return data as WiseRecipient[];
}

export async function getWiseTransfers(): Promise<WiseTransfer[]> {
  const { data, error } = await (supabase as any).from("wise_transfers").select("*").order("transfer_date", { ascending: false }).limit(500);
  if (error) throw error;
  return (data ?? []).map((t: any) => ({ ...t, inr_received: Number(t.inr_received) })) as WiseTransfer[];
}

export type SalaryEntry = {
  id: string;
  pay_date: string;
  period_start: string;
  period_end: string;
  working_days: number;
  base_pay: number;
  overtime_pay: number;
  health_insurance: number;
  pension: number;
  employment_insurance: number;
  tax: number;
  lunch_days: number;
  lunch_per_day: number;
  dorm: number;
  fixed_deduction: number;
  net_yen: number;
  note: string | null;
  created_at: string;
};

export async function getSalaryEntries(): Promise<SalaryEntry[]> {
  const { data, error } = await (supabase as any).from("salary_entries").select("*").order("pay_date", { ascending: false });
  if (error) throw error;
  return (data ?? []) as SalaryEntry[];
}
