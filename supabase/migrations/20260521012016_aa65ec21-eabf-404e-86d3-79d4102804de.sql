
-- 1. Salary: add custom extras & bonus flag
ALTER TABLE public.salary_entries
  ADD COLUMN IF NOT EXISTS extra_additions integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS extra_deductions integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_bonus boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS extras_note text;

-- 2. Seed new accounts for existing users
INSERT INTO public.accounts (user_id, name, bank_type, color, credit_limit_yen)
SELECT u.id, 'PayPay', 'paypay', '#ff0033', 0
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM public.accounts a WHERE a.user_id = u.id AND a.bank_type = 'paypay');

INSERT INTO public.accounts (user_id, name, bank_type, color, credit_limit_yen)
SELECT u.id, 'Cash', 'cash', '#5c5c5c', 0
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM public.accounts a WHERE a.user_id = u.id AND a.bank_type = 'cash');

-- 3. Update new-user seeding
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, display_name)
    VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)));
  INSERT INTO public.accounts (user_id, name, bank_type, color, credit_limit_yen) VALUES
    (NEW.id, 'Aichi Bank', 'aichi', '#0d0d0d', 0),
    (NEW.id, 'Rakuten Bank', 'rakuten', '#bf0000', 0),
    (NEW.id, 'Wise', 'wise', '#37b88b', 0),
    (NEW.id, 'PayPay', 'paypay', '#ff0033', 0),
    (NEW.id, 'PayPay Credit', 'paypay_credit', '#ff5577', 300000),
    (NEW.id, 'Cash', 'cash', '#5c5c5c', 0);
  INSERT INTO public.wise_recipients (user_id, name, relation, min_yen) VALUES
    (NEW.id, 'Mom', 'parent', 390000),
    (NEW.id, 'Dad', 'parent', 390000),
    (NEW.id, 'Bro', 'sibling', 100000),
    (NEW.id, 'Self', 'self', 0),
    (NEW.id, 'Others', 'other', 0);
  RETURN NEW;
END;
$function$;

-- 4. Update expense balance trigger
CREATE OR REPLACE FUNCTION public.handle_expense_balance()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  src_bank text;
  dest_id uuid;
  amt bigint;
  fee bigint;
BEGIN
  IF TG_OP = 'INSERT' THEN
    amt := NEW.amount_yen;
    fee := COALESCE(NEW.charge_yen, 0);

    -- Mirror row inserted by another trigger run: just adjust the destination balance
    IF NEW.is_mirror THEN
      IF NEW.is_settlement THEN
        UPDATE accounts SET balance_yen = balance_yen - amt WHERE id = NEW.account_id;
      ELSE
        UPDATE accounts SET balance_yen = balance_yen + amt WHERE id = NEW.account_id;
      END IF;
      RETURN NEW;
    END IF;

    SELECT bank_type INTO src_bank FROM accounts WHERE id = NEW.account_id;

    -- PayPay settle-up: clear paypay_credit debt only (no auto-debit from Aichi anymore)
    IF src_bank = 'paypay_credit' AND NEW.is_settlement THEN
      UPDATE accounts SET balance_yen = balance_yen - amt WHERE id = NEW.account_id;
      RETURN NEW;
    END IF;

    -- Aichi auto-transfer (now includes paypay)
    IF src_bank = 'aichi' AND NEW.category IN ('wise','rakuten','paypay','mom','dad','bro','preethu','self','others') THEN
      IF NEW.category = 'rakuten' THEN
        SELECT id INTO dest_id FROM accounts WHERE user_id = NEW.user_id AND bank_type = 'rakuten' LIMIT 1;
      ELSIF NEW.category = 'paypay' THEN
        SELECT id INTO dest_id FROM accounts WHERE user_id = NEW.user_id AND bank_type = 'paypay' LIMIT 1;
      ELSE
        SELECT id INTO dest_id FROM accounts WHERE user_id = NEW.user_id AND bank_type = 'wise' LIMIT 1;
      END IF;
      UPDATE accounts SET balance_yen = balance_yen - (amt + fee) WHERE id = NEW.account_id;
      IF dest_id IS NOT NULL AND dest_id <> NEW.account_id THEN
        INSERT INTO expenses (user_id, account_id, amount_yen, payment_method, category, description, expense_date, is_mirror, parent_expense_id)
          VALUES (NEW.user_id, dest_id, amt, 'credit', 'transfer_in', COALESCE(NEW.description, 'From Aichi'), NEW.expense_date, true, NEW.id);
      END IF;
      RETURN NEW;
    END IF;

    -- PayPay Credit normal purchase / prepayment
    IF src_bank = 'paypay_credit' THEN
      IF NEW.payment_method = 'credit' THEN
        UPDATE accounts SET balance_yen = balance_yen - amt WHERE id = NEW.account_id;
      ELSE
        UPDATE accounts SET balance_yen = balance_yen + amt WHERE id = NEW.account_id;
      END IF;
      RETURN NEW;
    END IF;

    -- Regular bank expense (rakuten, wise, paypay, cash, others)
    IF NEW.payment_method = 'credit' THEN
      UPDATE accounts SET balance_yen = balance_yen + amt WHERE id = NEW.account_id;
    ELSE
      UPDATE accounts SET balance_yen = balance_yen - (amt + fee) WHERE id = NEW.account_id;
    END IF;
    RETURN NEW;

  ELSIF TG_OP = 'DELETE' THEN
    amt := OLD.amount_yen;
    fee := COALESCE(OLD.charge_yen, 0);
    SELECT bank_type INTO src_bank FROM accounts WHERE id = OLD.account_id;

    IF OLD.is_mirror THEN
      IF OLD.is_settlement THEN
        UPDATE accounts SET balance_yen = balance_yen + amt WHERE id = OLD.account_id;
      ELSE
        UPDATE accounts SET balance_yen = balance_yen - amt WHERE id = OLD.account_id;
      END IF;
      RETURN OLD;
    END IF;

    IF src_bank = 'paypay_credit' AND OLD.is_settlement THEN
      UPDATE accounts SET balance_yen = balance_yen + amt WHERE id = OLD.account_id;
      RETURN OLD;
    END IF;

    IF src_bank = 'aichi' AND OLD.category IN ('wise','rakuten','paypay','mom','dad','bro','preethu','self','others') THEN
      UPDATE accounts SET balance_yen = balance_yen + (amt + fee) WHERE id = OLD.account_id;
      RETURN OLD;
    END IF;

    IF src_bank = 'paypay_credit' THEN
      IF OLD.payment_method = 'credit' THEN
        UPDATE accounts SET balance_yen = balance_yen + amt WHERE id = OLD.account_id;
      ELSE
        UPDATE accounts SET balance_yen = balance_yen - amt WHERE id = OLD.account_id;
      END IF;
      RETURN OLD;
    END IF;

    IF OLD.payment_method = 'credit' THEN
      UPDATE accounts SET balance_yen = balance_yen - amt WHERE id = OLD.account_id;
    ELSE
      UPDATE accounts SET balance_yen = balance_yen + (amt + fee) WHERE id = OLD.account_id;
    END IF;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$function$;

-- 5. Update recompute_balances to handle new account types
CREATE OR REPLACE FUNCTION public.recompute_balances()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  a record;
  total bigint;
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  FOR a IN SELECT id, bank_type, opening_balance_yen FROM accounts WHERE user_id = uid LOOP
    total := COALESCE(a.opening_balance_yen, 0);
    IF a.bank_type = 'aichi' THEN
      total := total + COALESCE((SELECT SUM(net_yen) FROM salary_entries WHERE user_id = uid), 0);
    END IF;
    IF a.bank_type = 'paypay_credit' THEN
      total := total
        + COALESCE((SELECT SUM(amount_yen) FROM expenses WHERE account_id = a.id AND payment_method='debit' AND NOT is_settlement), 0)
        - COALESCE((SELECT SUM(amount_yen) FROM expenses WHERE account_id = a.id AND (payment_method='credit' OR is_settlement)), 0);
    ELSE
      total := total
        + COALESCE((SELECT SUM(amount_yen) FROM expenses WHERE account_id = a.id AND payment_method='credit'), 0)
        - COALESCE((SELECT SUM(amount_yen + COALESCE(charge_yen,0)) FROM expenses WHERE account_id = a.id AND payment_method='debit'), 0);
    END IF;
    IF a.bank_type = 'wise' THEN
      total := total - COALESCE((SELECT SUM(amount_sent_yen + COALESCE(charge_yen,0)) FROM wise_transfers WHERE user_id = uid), 0);
    END IF;
    UPDATE accounts SET balance_yen = total WHERE id = a.id;
  END LOOP;
END;
$function$;
