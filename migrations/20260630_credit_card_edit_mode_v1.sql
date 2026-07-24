-- Credit Card Edit Mode v1
-- Adds nullable manual-maintenance fields and durable links.
-- This migration does not modify Plaid balances or existing card balances.

alter table public.credit_cards
  add column if not exists regular_apr numeric,
  add column if not exists promo_apr numeric,
  add column if not exists autopay_enabled boolean,
  add column if not exists autopay_account_label text,
  add column if not exists payment_account_notes text,
  add column if not exists manual_last4 text,
  add column if not exists plaid_account_id uuid references public.plaid_accounts(id),
  add column if not exists scheduled_payment_id uuid references public.scheduled_payments(id);

alter table public.scheduled_payments
  add column if not exists user_id uuid references auth.users(id),
  add column if not exists credit_card_id uuid references public.credit_cards(id);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'credit_cards_regular_apr_range'
  ) then
    alter table public.credit_cards
      add constraint credit_cards_regular_apr_range
      check (regular_apr is null or (regular_apr >= 0 and regular_apr <= 100));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'credit_cards_promo_apr_range'
  ) then
    alter table public.credit_cards
      add constraint credit_cards_promo_apr_range
      check (promo_apr is null or (promo_apr >= 0 and promo_apr <= 100));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'credit_cards_manual_last4_format'
  ) then
    alter table public.credit_cards
      add constraint credit_cards_manual_last4_format
      check (manual_last4 is null or manual_last4 ~ '^[0-9]{1,4}$');
  end if;
end $$;

create unique index if not exists credit_cards_plaid_account_id_unique
  on public.credit_cards(plaid_account_id)
  where plaid_account_id is not null;

create index if not exists credit_cards_scheduled_payment_id_idx
  on public.credit_cards(scheduled_payment_id);

create index if not exists scheduled_payments_user_id_idx
  on public.scheduled_payments(user_id);

create index if not exists scheduled_payments_credit_card_id_idx
  on public.scheduled_payments(credit_card_id);

grant select, insert, update on public.credit_cards to authenticated;
grant select, insert, update on public.scheduled_payments to authenticated;

alter table public.credit_cards enable row level security;
alter table public.scheduled_payments enable row level security;

drop policy if exists credit_cards_select_own on public.credit_cards;
create policy credit_cards_select_own
  on public.credit_cards
  for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists credit_cards_insert_own on public.credit_cards;
create policy credit_cards_insert_own
  on public.credit_cards
  for insert
  to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists credit_cards_update_own on public.credit_cards;
create policy credit_cards_update_own
  on public.credit_cards
  for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists scheduled_payments_select_own_or_legacy on public.scheduled_payments;
create policy scheduled_payments_select_own_or_legacy
  on public.scheduled_payments
  for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or user_id is null
    or exists (
      select 1
      from public.credit_cards
      where credit_cards.id = scheduled_payments.credit_card_id
        and credit_cards.user_id = (select auth.uid())
    )
  );

drop policy if exists scheduled_payments_insert_own on public.scheduled_payments;
create policy scheduled_payments_insert_own
  on public.scheduled_payments
  for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and (
      credit_card_id is null
      or exists (
        select 1
        from public.credit_cards
        where credit_cards.id = scheduled_payments.credit_card_id
          and credit_cards.user_id = (select auth.uid())
      )
    )
  );

drop policy if exists scheduled_payments_update_own on public.scheduled_payments;
create policy scheduled_payments_update_own
  on public.scheduled_payments
  for update
  to authenticated
  using (
    user_id = (select auth.uid())
    or exists (
      select 1
      from public.credit_cards
      where credit_cards.id = scheduled_payments.credit_card_id
        and credit_cards.user_id = (select auth.uid())
    )
  )
  with check (
    user_id = (select auth.uid())
    and (
      credit_card_id is null
      or exists (
        select 1
        from public.credit_cards
        where credit_cards.id = scheduled_payments.credit_card_id
          and credit_cards.user_id = (select auth.uid())
      )
    )
  );
