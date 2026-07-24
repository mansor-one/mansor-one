alter table public.obligation_payment_links
  add column if not exists payment_account_id uuid,
  add column if not exists payment_account_source text;

comment on column public.obligation_payment_links.payment_account_id is
  'Selected payment account row ID. Interpreted with payment_account_source; null preserves legacy text-only confirmations.';

comment on column public.obligation_payment_links.payment_account_source is
  'Payment account namespace: plaid_account, manual_account, cash, or other.';

alter table public.obligation_payment_links
  drop constraint if exists obligation_payment_links_payment_account_source_check;

alter table public.obligation_payment_links
  add constraint obligation_payment_links_payment_account_source_check
  check (payment_account_source is null or payment_account_source in ('plaid_account', 'manual_account', 'cash', 'other'));
