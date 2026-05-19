
-- 1. Accounts: credit limit
ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS credit_limit_yen integer NOT NULL DEFAULT 0;

-- 2. Expenses: charge + payment method
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS charge_yen integer NOT NULL DEFAULT 0;
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS payment_method text NOT NULL DEFAULT 'debit';

-- 3. Seed PayPay Credit account for existing users
INSERT INTO public.accounts (user_id, name, bank_type, color, credit_limit_yen)
SELECT p.id, 'PayPay Credit', 'paypay_credit', '#ff0033', 300000
FROM public.profiles p
WHERE NOT EXISTS (
  SELECT 1 FROM public.accounts a WHERE a.user_id = p.id AND a.bank_type = 'paypay_credit'
);

-- 4. Update handle_new_user to also seed PayPay Credit + updated recipients
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
    VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)));
  INSERT INTO public.accounts (user_id, name, bank_type, color, credit_limit_yen) VALUES
    (NEW.id, 'Aichi Bank', 'aichi', '#0d0d0d', 0),
    (NEW.id, 'Rakuten Bank', 'rakuten', '#bf0000', 0),
    (NEW.id, 'Wise', 'wise', '#37b88b', 0),
    (NEW.id, 'PayPay Credit', 'paypay_credit', '#ff0033', 300000);
  INSERT INTO public.wise_recipients (user_id, name, relation, min_yen) VALUES
    (NEW.id, 'Mom', 'parent', 390000),
    (NEW.id, 'Dad', 'parent', 390000),
    (NEW.id, 'Bro', 'sibling', 100000),
    (NEW.id, 'Self', 'self', 0),
    (NEW.id, 'Others', 'other', 0);
  RETURN NEW;
END;
$$;

-- 5. Update Wise recipients for existing users: rename Preethu->Bro, add Self/Others
UPDATE public.wise_recipients SET name = 'Bro' WHERE name = 'Preethu';
INSERT INTO public.wise_recipients (user_id, name, relation, min_yen)
SELECT p.id, 'Self', 'self', 0 FROM public.profiles p
WHERE NOT EXISTS (SELECT 1 FROM public.wise_recipients r WHERE r.user_id = p.id AND r.name = 'Self');
INSERT INTO public.wise_recipients (user_id, name, relation, min_yen)
SELECT p.id, 'Others', 'other', 0 FROM public.profiles p
WHERE NOT EXISTS (SELECT 1 FROM public.wise_recipients r WHERE r.user_id = p.id AND r.name = 'Others');

-- 6. Updated transfer trigger: Aichi -> Rakuten or Wise with charge support
CREATE OR REPLACE FUNCTION public.handle_expense_wise_topup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  dest_id uuid;
  src_bank text;
  fee int;
BEGIN
  fee := COALESCE(NEW.charge_yen, 0);

  -- Only transfer categories from Aichi
  IF NEW.category NOT IN ('wise','rakuten','mom','dad','bro','preethu','self','others') THEN
    RETURN NEW;
  END IF;

  SELECT bank_type INTO src_bank FROM public.accounts WHERE id = NEW.account_id;
  IF src_bank <> 'aichi' THEN
    RETURN NEW;
  END IF;

  IF NEW.category = 'rakuten' THEN
    SELECT id INTO dest_id FROM public.accounts
      WHERE user_id = NEW.user_id AND bank_type = 'rakuten' LIMIT 1;
  ELSE
    SELECT id INTO dest_id FROM public.accounts
      WHERE user_id = NEW.user_id AND bank_type = 'wise' LIMIT 1;
  END IF;

  IF dest_id IS NOT NULL AND dest_id <> NEW.account_id THEN
    UPDATE public.accounts SET balance_yen = balance_yen + NEW.amount_yen WHERE id = dest_id;
    UPDATE public.accounts SET balance_yen = balance_yen - (NEW.amount_yen + fee) WHERE id = NEW.account_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS expenses_wise_topup ON public.expenses;
CREATE TRIGGER expenses_wise_topup
AFTER INSERT ON public.expenses
FOR EACH ROW EXECUTE FUNCTION public.handle_expense_wise_topup();

-- Make sure wise transfer trigger is wired too
DROP TRIGGER IF EXISTS wise_transfer_balance ON public.wise_transfers;
CREATE TRIGGER wise_transfer_balance
AFTER INSERT ON public.wise_transfers
FOR EACH ROW EXECUTE FUNCTION public.handle_wise_transfer_balance();

-- 7. Salary entries table
CREATE TABLE IF NOT EXISTS public.salary_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  pay_date date NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  working_days integer NOT NULL DEFAULT 0,
  base_pay integer NOT NULL DEFAULT 0,
  overtime_pay integer NOT NULL DEFAULT 0,
  health_insurance integer NOT NULL DEFAULT 0,
  pension integer NOT NULL DEFAULT 0,
  employment_insurance integer NOT NULL DEFAULT 0,
  tax integer NOT NULL DEFAULT 0,
  lunch_days integer NOT NULL DEFAULT 0,
  lunch_per_day integer NOT NULL DEFAULT 251,
  dorm integer NOT NULL DEFAULT 20000,
  fixed_deduction integer NOT NULL DEFAULT 740,
  net_yen integer NOT NULL DEFAULT 0,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.salary_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own salary all" ON public.salary_entries;
CREATE POLICY "own salary all" ON public.salary_entries
FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 8. Salary credit trigger -> add net_yen to Aichi
CREATE OR REPLACE FUNCTION public.handle_salary_credit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  aichi_id uuid;
BEGIN
  SELECT id INTO aichi_id FROM public.accounts
    WHERE user_id = NEW.user_id AND bank_type = 'aichi' LIMIT 1;
  IF aichi_id IS NOT NULL THEN
    UPDATE public.accounts SET balance_yen = balance_yen + NEW.net_yen WHERE id = aichi_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS salary_credit ON public.salary_entries;
CREATE TRIGGER salary_credit
AFTER INSERT ON public.salary_entries
FOR EACH ROW EXECUTE FUNCTION public.handle_salary_credit();
