
-- Profiles
create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
create policy "own profile select" on public.profiles for select using (auth.uid() = id);
create policy "own profile insert" on public.profiles for insert with check (auth.uid() = id);
create policy "own profile update" on public.profiles for update using (auth.uid() = id);

-- Accounts
create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  name text not null,
  bank_type text not null default 'other',
  color text not null default '#2d2d2d',
  balance_yen bigint not null default 0,
  created_at timestamptz not null default now()
);
alter table public.accounts enable row level security;
create policy "own accounts all" on public.accounts for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index on public.accounts(user_id);

-- Receipts
create table public.receipts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  account_id uuid references public.accounts on delete set null,
  image_path text not null,
  merchant text,
  total_yen integer,
  tax_yen integer,
  purchase_date date,
  items jsonb not null default '[]'::jsonb,
  raw_text text,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);
alter table public.receipts enable row level security;
create policy "own receipts all" on public.receipts for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index on public.receipts(user_id, created_at desc);

-- Expenses
create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  account_id uuid not null references public.accounts on delete cascade,
  receipt_id uuid references public.receipts on delete set null,
  amount_yen integer not null,
  category text not null default 'other',
  description text,
  expense_date date not null default current_date,
  created_at timestamptz not null default now()
);
alter table public.expenses enable row level security;
create policy "own expenses all" on public.expenses for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index on public.expenses(user_id, expense_date desc);

-- New user trigger: profile + 2 accounts
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name) values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));
  insert into public.accounts (user_id, name, bank_type, color) values
    (new.id, 'Aichi Bank', 'aichi', '#0d0d0d'),
    (new.id, 'Rakuten Bank', 'rakuten', '#bf0000');
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Storage bucket for receipts (private)
insert into storage.buckets (id, name, public) values ('receipts', 'receipts', false);

create policy "users read own receipts" on storage.objects for select
  using (bucket_id = 'receipts' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "users upload own receipts" on storage.objects for insert
  with check (bucket_id = 'receipts' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "users delete own receipts" on storage.objects for delete
  using (bucket_id = 'receipts' and auth.uid()::text = (storage.foldername(name))[1]);
