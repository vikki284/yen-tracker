
-- 1. profiles.onboarded
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS onboarded boolean NOT NULL DEFAULT false;
UPDATE public.profiles SET onboarded = true WHERE id IN (SELECT DISTINCT user_id FROM public.accounts);

-- 2. handle_new_user: only profile + wise + recipients
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, display_name, onboarded)
    VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)), false);
  INSERT INTO public.accounts (user_id, name, bank_type, color, credit_limit_yen) VALUES
    (NEW.id, 'Wise', 'wise', '#37b88b', 0);
  INSERT INTO public.wise_recipients (user_id, name, relation, min_yen) VALUES
    (NEW.id, 'Mom', 'parent', 390000),
    (NEW.id, 'Dad', 'parent', 390000),
    (NEW.id, 'Bro', 'sibling', 100000),
    (NEW.id, 'Self', 'self', 0),
    (NEW.id, 'Others', 'other', 0);
  RETURN NEW;
END;
$function$;

-- 3. handle_expense_balance: any-bank transfers via name match
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
  cat_lower text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    amt := NEW.amount_yen;
    fee := COALESCE(NEW.charge_yen, 0);

    -- Mirror credit/debit row inserted by another run: adjust dest balance only
    IF NEW.is_mirror THEN
      IF NEW.is_settlement THEN
        UPDATE accounts SET balance_yen = balance_yen - amt WHERE id = NEW.account_id;
      ELSE
        UPDATE accounts SET balance_yen = balance_yen + amt WHERE id = NEW.account_id;
      END IF;
      RETURN NEW;
    END IF;

    SELECT bank_type INTO src_bank FROM accounts WHERE id = NEW.account_id;

    -- PayPay-credit settle-up
    IF src_bank = 'paypay_credit' AND NEW.is_settlement THEN
      UPDATE accounts SET balance_yen = balance_yen - amt WHERE id = NEW.account_id;
      RETURN NEW;
    END IF;

    -- Resolve destination for a transfer (only when source is a real cash-bearing account, not paypay_credit)
    dest_id := NULL;
    IF NEW.payment_method = 'debit' AND src_bank <> 'paypay_credit' THEN
      cat_lower := lower(NEW.category);
      -- Wise recipients
      IF cat_lower IN ('mom','dad','bro','self','others','preethu','wise') THEN
        SELECT id INTO dest_id FROM accounts WHERE user_id = NEW.user_id AND bank_type = 'wise' LIMIT 1;
      ELSIF cat_lower = 'paypay' THEN
        SELECT id INTO dest_id FROM accounts WHERE user_id = NEW.user_id AND bank_type = 'paypay' LIMIT 1;
      ELSIF cat_lower = 'rakuten' THEN
        SELECT id INTO dest_id FROM accounts WHERE user_id = NEW.user_id AND bank_type = 'rakuten' LIMIT 1;
      ELSE
        -- Match any other account by name (case-insensitive)
        SELECT id INTO dest_id FROM accounts
          WHERE user_id = NEW.user_id
            AND lower(name) = cat_lower
            AND id <> NEW.account_id
            AND bank_type <> 'paypay_credit'
          LIMIT 1;
      END IF;
    END IF;

    -- Transfer: debit source, mirror credit into destination
    IF dest_id IS NOT NULL AND dest_id <> NEW.account_id THEN
      UPDATE accounts SET balance_yen = balance_yen - (amt + fee) WHERE id = NEW.account_id;
      INSERT INTO expenses (user_id, account_id, amount_yen, payment_method, category, description, expense_date, is_mirror, parent_expense_id)
        VALUES (NEW.user_id, dest_id, amt, 'credit', 'transfer_in', COALESCE(NEW.description, 'Transfer'), NEW.expense_date, true, NEW.id);
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

    -- Regular expense
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

    -- Determine if this was a transfer (had a child mirror row OR matched category)
    -- Easiest: check if any mirror with parent_expense_id = OLD.id exists; cascade delete it (which itself reverses via this trigger)
    IF src_bank <> 'paypay_credit' AND OLD.payment_method = 'debit' THEN
      cat_lower := lower(OLD.category);
      IF EXISTS (SELECT 1 FROM expenses WHERE parent_expense_id = OLD.id) THEN
        -- Just reverse source debit; mirror rows auto-delete via ON DELETE? They don't FK; delete explicitly
        DELETE FROM expenses WHERE parent_expense_id = OLD.id;
        UPDATE accounts SET balance_yen = balance_yen + (amt + fee) WHERE id = OLD.account_id;
        RETURN OLD;
      END IF;
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
