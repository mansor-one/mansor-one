alter table public.plaid_accounts
  add column if not exists is_spendable boolean not null default false;

comment on column public.plaid_accounts.is_spendable is
  'Explicit opt-in for treating a connected non-depository asset as usable cash. Investment and retirement accounts default to false.';
