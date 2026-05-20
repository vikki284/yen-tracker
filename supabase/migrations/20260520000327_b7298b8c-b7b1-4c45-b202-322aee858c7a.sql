
ALTER TABLE public.expenses 
  ADD COLUMN IF NOT EXISTS is_mirror boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_settlement boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS parent_expense_id uuid REFERENCES public.expenses(id) ON DELETE CASCADE;

ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS opening_balance_yen bigint NOT NULL DEFAULT 0;

-- Drop any prior expense triggers and old function
DROP TRIGGER IF EXISTS expense_balance ON public.expenses;
DROP TRIGGER IF EXISTS expense_wise_topup ON public.expenses;
DROP TRIGGER IF EXISTS handle_expense_wise_topup ON public.expenses;
DROP TRIGGER IF EXISTS trg_expense_wise_topup ON public.expenses;
DROP FUNCTION IF EXISTS public.handle_expense_wise_topup() CASCADE;

CREATE OR REPLACE FUNCTION public.handle_expense_balance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
        -- mirror of paypay settle-up sits on aichi as a debit
        UPDATE accounts SET balance_yen = balance_yen - amt WHERE id = NEW.account_id;
      ELSE
        -- mirror of aichi→rakuten/wise transfer sits on destination as credit
        UPDATE accounts SET balance_yen = balance_yen + amt WHERE id = NEW.account_id;
      END IF;
      RETURN NEW;
    END IF;

    SELECT bank_type INTO src_bank FROM accounts WHERE id = NEW.account_id;

    -- PayPay settle-up: clear paypay debt + mirror debit to aichi
    IF src_bank = 'paypay_credit' AND NEW.is_settlement THEN
      UPDATE accounts SET balance_yen = balance_yen - amt WHERE id = NEW.account_id;
      SELECT id INTO dest_id FROM accounts WHERE user_id = NEW.user_id AND bank_type = 'aichi' LIMIT 1;
      IF dest_id IS NOT NULL THEN
        INSERT INTO expenses (user_id, account_id, amount_yen, payment_method, category, description, expense_date, is_mirror, is_settlement, parent_expense_id)
          VALUES (NEW.user_id, dest_id, amt, 'debit', 'paypay', COALESCE(NEW.description, 'PayPay settle-up'), NEW.expense_date, true, true, NEW.id);
      END IF;
      RETURN NEW;
    END IF;

    -- Aichi auto-transfer
    IF src_bank = 'aichi' AND NEW.category IN ('wise','rakuten','mom','dad','bro','preethu','self','others') THEN
      IF NEW.category = 'rakuten' THEN
        SELECT id INTO dest_id FROM accounts WHERE user_id = NEW.user_id AND bank_type = 'rakuten' LIMIT 1;
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

    -- Regular bank expense
    IF NEW.payment_method = 'credit' THEN
      UPDATE accounts SET balance_yen = balance_yen + amt WHERE id = NEW.account_id;
    ELSE
      UPDATE accounts SET balance_yen = balance_yen - amt WHERE id = NEW.account_id;
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

    IF src_bank = 'aichi' AND OLD.category IN ('wise','rakuten','mom','dad','bro','preethu','self','others') THEN
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
      UPDATE accounts SET balance_yen = balance_yen + amt WHERE id = OLD.account_id;
    END IF;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER expense_balance
  AFTER INSERT OR DELETE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.handle_expense_balance();

-- UPDATE handling: reverse + reapply via a wrapper
CREATE OR REPLACE FUNCTION public.handle_expense_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Block updates to mirror rows (must edit parent)
  IF OLD.is_mirror THEN
    RAISE EXCEPTION 'Cannot edit a mirror entry; edit or delete its parent transaction';
  END IF;
  -- Reverse old
  PERFORM 1; -- placeholder; reuse delete logic
  -- Easiest: forbid updates that change amount/account/method via trigger; we will handle via delete+insert in app.
  -- But allow description/date/category trivial updates with no balance impact when amount/method unchanged
  IF NEW.amount_yen <> OLD.amount_yen
     OR COALESCE(NEW.charge_yen,0) <> COALESCE(OLD.charge_yen,0)
     OR NEW.payment_method <> OLD.payment_method
     OR NEW.account_id <> OLD.account_id
     OR NEW.category <> OLD.category THEN
    RAISE EXCEPTION 'Edit changes balance-affecting fields; delete and re-create instead';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS expense_update_guard ON public.expenses;
CREATE TRIGGER expense_update_guard
  BEFORE UPDATE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.handle_expense_update();

-- Re-attach salary + wise triggers (in case they're missing)
DROP TRIGGER IF EXISTS salary_credit ON public.salary_entries;
CREATE TRIGGER salary_credit
  AFTER INSERT ON public.salary_entries
  FOR EACH ROW EXECUTE FUNCTION public.handle_salary_credit();

-- Also handle salary delete: reverse net pay from aichi
CREATE OR REPLACE FUNCTION public.handle_salary_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE aichi_id uuid;
BEGIN
  SELECT id INTO aichi_id FROM accounts WHERE user_id = OLD.user_id AND bank_type='aichi' LIMIT 1;
  IF aichi_id IS NOT NULL THEN
    UPDATE accounts SET balance_yen = balance_yen - OLD.net_yen WHERE id = aichi_id;
  END IF;
  RETURN OLD;
END;
$$;
DROP TRIGGER IF EXISTS salary_delete ON public.salary_entries;
CREATE TRIGGER salary_delete
  AFTER DELETE ON public.salary_entries
  FOR EACH ROW EXECUTE FUNCTION public.handle_salary_delete();

DROP TRIGGER IF EXISTS wise_transfer_balance ON public.wise_transfers;
CREATE TRIGGER wise_transfer_balance
  AFTER INSERT ON public.wise_transfers
  FOR EACH ROW EXECUTE FUNCTION public.handle_wise_transfer_balance();

-- Reverse wise transfer on delete
CREATE OR REPLACE FUNCTION public.handle_wise_transfer_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE wise_id uuid;
BEGIN
  SELECT id INTO wise_id FROM accounts WHERE user_id = OLD.user_id AND bank_type='wise' LIMIT 1;
  IF wise_id IS NOT NULL THEN
    UPDATE accounts SET balance_yen = balance_yen + (OLD.amount_sent_yen + COALESCE(OLD.charge_yen,0)) WHERE id = wise_id;
  END IF;
  RETURN OLD;
END;
$$;
DROP TRIGGER IF EXISTS wise_transfer_delete ON public.wise_transfers;
CREATE TRIGGER wise_transfer_delete
  AFTER DELETE ON public.wise_transfers
  FOR EACH ROW EXECUTE FUNCTION public.handle_wise_transfer_delete();

-- Re-attach signup trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- One-shot recompute from logged data
CREATE OR REPLACE FUNCTION public.recompute_balances()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;
