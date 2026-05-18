-- 1. wise_recipients
CREATE TABLE public.wise_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  relation text NOT NULL DEFAULT 'family',
  min_yen integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.wise_recipients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own recipients all" ON public.wise_recipients
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 2. wise_transfers
CREATE TABLE public.wise_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  recipient_id uuid NOT NULL REFERENCES public.wise_recipients(id) ON DELETE CASCADE,
  amount_sent_yen integer NOT NULL CHECK (amount_sent_yen > 0),
  charge_yen integer NOT NULL DEFAULT 0 CHECK (charge_yen >= 0),
  inr_received numeric(12,2) NOT NULL CHECK (inr_received >= 0),
  transfer_date date NOT NULL DEFAULT CURRENT_DATE,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.wise_transfers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own transfers all" ON public.wise_transfers
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_wise_transfers_user_date ON public.wise_transfers(user_id, transfer_date DESC);
CREATE INDEX idx_wise_transfers_recipient ON public.wise_transfers(recipient_id);

-- 3. Trigger: expense flagged as a wise top-up moves money from source account into wise
CREATE OR REPLACE FUNCTION public.handle_expense_wise_topup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  wise_id uuid;
BEGIN
  IF lower(coalesce(NEW.description, '')) LIKE 'wise%' OR NEW.category = 'wise' THEN
    SELECT id INTO wise_id FROM public.accounts
      WHERE user_id = NEW.user_id AND bank_type = 'wise' LIMIT 1;
    IF wise_id IS NOT NULL AND wise_id <> NEW.account_id THEN
      UPDATE public.accounts SET balance_yen = balance_yen + NEW.amount_yen WHERE id = wise_id;
      UPDATE public.accounts SET balance_yen = balance_yen - NEW.amount_yen WHERE id = NEW.account_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER expense_wise_topup
  AFTER INSERT ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.handle_expense_wise_topup();

-- 4. Trigger: wise transfer debits the wise account
CREATE OR REPLACE FUNCTION public.handle_wise_transfer_balance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  wise_id uuid;
BEGIN
  SELECT id INTO wise_id FROM public.accounts
    WHERE user_id = NEW.user_id AND bank_type = 'wise' LIMIT 1;
  IF wise_id IS NOT NULL THEN
    UPDATE public.accounts
      SET balance_yen = balance_yen - (NEW.amount_sent_yen + NEW.charge_yen)
      WHERE id = wise_id;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER wise_transfer_balance
  AFTER INSERT ON public.wise_transfers
  FOR EACH ROW EXECUTE FUNCTION public.handle_wise_transfer_balance();

-- 5. Update handle_new_user to seed Wise + recipients
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
    VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)));
  INSERT INTO public.accounts (user_id, name, bank_type, color) VALUES
    (NEW.id, 'Aichi Bank', 'aichi', '#0d0d0d'),
    (NEW.id, 'Rakuten Bank', 'rakuten', '#bf0000'),
    (NEW.id, 'Wise', 'wise', '#37b88b');
  INSERT INTO public.wise_recipients (user_id, name, relation, min_yen) VALUES
    (NEW.id, 'Mom', 'parent', 195000),
    (NEW.id, 'Dad', 'parent', 195000),
    (NEW.id, 'Bro', 'sibling', 100000);
  RETURN NEW;
END;
$$;