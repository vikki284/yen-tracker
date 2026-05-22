# Yen Tracker — major update plan

## 1. Rebrand: Chōbo → Yen Tracker

- Replace every "Chōbo" / "帳簿" string across the app (auth page, AppShell header, page `<title>` metas, README-level copy in marketing sections).
- Update root `head()` in `src/routes/__root.tsx` so site title + default og:title use "Yen Tracker".
- New tagline on landing/auth panel: **"One app for all your banks, cards, receipts, salaries, and transfers — designed for everyday life in Japan."**

## 2. Wise dashboard — show JPY sent home on the home page

- On the home dashboard (`src/routes/index.tsx`), add a "Sent home" stat card showing total JPY + INR (sum of `wise_transfers`) alongside the existing bank cards.
- Keep the existing per-recipient breakdown on the Wise page untouched.

## 3. Signup onboarding wizard

- New route `src/routes/onboarding.tsx` (gated: shows when user has no `accounts` rows or a `profiles.onboarded` flag is false).
- Add `onboarded boolean default false` to `profiles`. Set true on completion.
- Wizard steps:
  1. **Banks** — "How many bank accounts?" (number 1–6) → for each, ask name + color picker. Each created as `bank_type='custom'` unless name matches a known seed (aichi / rakuten — auto-flag so existing transfer logic still works).
  2. **Cash** — "How much cash on hand?" → creates `Cash` account with `opening_balance_yen`.
  3. **PayPay** — "Starting PayPay balance?" → creates `PayPay` account.
  4. **PayPay Credit** — Yes/No. If yes, ask limit (default ¥300,000); else skip (no row created).
- Remove the hard-coded seed list from `handle_new_user()`. Trigger now only creates the `profiles` row + Wise account (the constant) + seeds Wise recipients. All other accounts come from the wizard.
- Auth signup redirects to `/onboarding` instead of `/`.

## 4. Transfers from ANY account (not just Aichi)

- Drop the `src_bank = 'aichi'` restriction in `handle_expense_balance()`.
- Rule: if a debit expense's **category** is `wise`, `paypay`, or any other account's name (resolved by `accounts.name ilike category`), treat it as a transfer:
  - Debit source (amount + fee).
  - Insert mirror credit row in destination.
- Wise recipients (mom/dad/bro/self/others) still resolve to the Wise account regardless of source.
- Update `NewExpenseDialog` so transfer categories (wise, paypay, plus the user's other bank names) are offered on every bank — not just Aichi.

## 5. Receipt categorization & monthly report

- Update `scan-receipt.functions.ts` so the AI also returns a top-level `category` per item (one of `groceries`, `dining`, `shopping`, `household`, `transit`, `entertainment`, `other`) and a `subcategory` free-text (e.g. "chicken", "veggies").
- Persist on `receipts.items` as `{ name, qty, price, category, subcategory }` (no schema change — `items` is jsonb).
- Reports page (`src/routes/reports.tsx`): add **"Receipt breakdown by category"** section. For the selected month, group all receipt items by `category` → show totals + an expandable list of subcategories with running totals (e.g. Groceries ¥18,420 → chicken ¥4,200, eggs ¥980, veggies ¥3,100…).

## 6. Technical notes

- **Migration 1**: `profiles.onboarded` column + rewrite `handle_new_user()` to skip account seeding.
- **Migration 2**: rewrite `handle_expense_balance()` to resolve transfer destinations dynamically by account name match for the user.
- **Files touched** (rough):
  - migrations × 2
  - `src/routes/__root.tsx`, `src/routes/auth.tsx`, `src/routes/onboarding.tsx` (new), `src/routes/index.tsx`, `src/routes/reports.tsx`, `src/routes/wise.tsx`
  - `src/components/AppShell.tsx`, `src/components/NewExpenseDialog.tsx`
  - `src/lib/format.ts` (extend `CATEGORIES_BY_BANK` to be dynamic from accounts list), `src/lib/db.ts` (Receipt item type), `src/lib/scan-receipt.functions.ts`

## Open questions (will assume defaults if you don't override)

1. **Existing users**: keep current accounts as-is — only NEW signups go through the wizard. ✅ default.
2. **Custom banks & charges**: any transfer to wise/paypay/another bank will continue to ask for a charge (¥0 default).
3. **Receipt categorization**: AI-assigned at scan time; no manual editing UI in this pass (can add later).
