export const yen = (n: number | null | undefined) =>
  n == null ? "—" : `¥${Math.round(n).toLocaleString("ja-JP")}`;

export const monthLabel = (d: Date) =>
  d.toLocaleDateString("en-US", { month: "long", year: "numeric" });

export const dateLabel = (s: string | Date) =>
  new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

export const CATEGORIES = [
  "groceries", "dining", "transit", "utilities", "rent", "shopping",
  "entertainment", "health", "convenience", "wise", "other",
] as const;

export const inr = (n: number | null | undefined) =>
  n == null ? "—" : `₹${Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
export type Category = (typeof CATEGORIES)[number];
