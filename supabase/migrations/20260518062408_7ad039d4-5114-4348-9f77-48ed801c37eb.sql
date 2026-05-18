CREATE OR REPLACE FUNCTION public.handle_expense_wise_topup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  wise_id uuid;
  src_bank text;
BEGIN
  IF NEW.category NOT IN ('wise','mom','dad','preethu') THEN
    RETURN NEW;
  END IF;

  SELECT bank_type INTO src_bank FROM public.accounts WHERE id = NEW.account_id;
  IF src_bank <> 'aichi' THEN
    RETURN NEW;
  END IF;

  SELECT id INTO wise_id FROM public.accounts
    WHERE user_id = NEW.user_id AND bank_type = 'wise' LIMIT 1;
  IF wise_id IS NOT NULL AND wise_id <> NEW.account_id THEN
    UPDATE public.accounts SET balance_yen = balance_yen + NEW.amount_yen WHERE id = wise_id;
    UPDATE public.accounts SET balance_yen = balance_yen - NEW.amount_yen WHERE id = NEW.account_id;
  END IF;
  RETURN NEW;
END;
$$;