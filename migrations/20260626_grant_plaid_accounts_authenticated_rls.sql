grant select, insert, update on public.plaid_accounts to authenticated;
revoke select, insert, update on public.plaid_accounts from anon;

alter table public.plaid_accounts enable row level security;

drop policy if exists "Allow authenticated read plaid accounts" on public.plaid_accounts;
drop policy if exists "Users can manage own plaid accounts" on public.plaid_accounts;
drop policy if exists "Users can read own plaid accounts" on public.plaid_accounts;

drop policy if exists plaid_accounts_select_own on public.plaid_accounts;
create policy plaid_accounts_select_own
  on public.plaid_accounts
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists plaid_accounts_insert_own on public.plaid_accounts;
create policy plaid_accounts_insert_own
  on public.plaid_accounts
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists plaid_accounts_update_own on public.plaid_accounts;
create policy plaid_accounts_update_own
  on public.plaid_accounts
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
