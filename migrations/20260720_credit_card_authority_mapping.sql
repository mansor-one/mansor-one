alter table public.plaid_accounts
  add column if not exists plaid_minimum_payment_amount numeric,
  add column if not exists plaid_next_payment_due_date date,
  add column if not exists plaid_last_statement_balance numeric,
  add column if not exists plaid_liability_is_overdue boolean,
  add column if not exists plaid_liability_updated_at timestamptz;

comment on column public.plaid_accounts.plaid_minimum_payment_amount is
  'Minimum payment returned by Plaid Liabilities; null means unavailable, never estimated.';

-- Preserve every source row and establish the existing FK relationships only
-- when an alias resolves to exactly one active connected account.
with unique_matches as (
  select cc.id as credit_card_id, min(pa.id::text)::uuid as plaid_account_row_id
  from public.credit_cards cc
  join public.plaid_accounts pa on pa.user_id = cc.user_id
  join public.plaid_connections pc on pc.id = pa.connection_id
  where pc.status = 'active' and pc.archived_at is null and pc.disconnected_at is null
    and coalesce(pa.account_status, 'active') <> 'archived'
    and coalesce(pa.is_hidden, false) = false
    and (
      (upper(cc.name) = 'POPULAR VISA' and upper(pa.name) = 'VISA PREMIA REWARDS')
      or (upper(cc.name) = 'US BANK' and upper(pa.name) like '%4910%')
      or (upper(cc.name) = 'CHASE' and upper(pa.institution_name) = 'CHASE' and upper(pa.name) = 'CREDIT CARD')
    )
  group by cc.id
  having count(*) = 1
)
update public.credit_cards cc
set plaid_account_id = matches.plaid_account_row_id
from unique_matches matches
where cc.id = matches.credit_card_id
  and cc.plaid_account_id is null;

with unique_schedules as (
  select cc.id as credit_card_id, min(sp.id::text)::uuid as scheduled_payment_id
  from public.credit_cards cc
  join public.scheduled_payments sp
    on upper(sp.name) = upper(cc.name) and sp.is_active = true
  where upper(cc.name) in ('POPULAR VISA', 'US BANK', 'CHASE')
  group by cc.id
  having count(*) = 1
)
update public.credit_cards cc
set scheduled_payment_id = matches.scheduled_payment_id
from unique_schedules matches
where cc.id = matches.credit_card_id
  and cc.scheduled_payment_id is null;

update public.scheduled_payments sp
set credit_card_id = cc.id
from public.credit_cards cc
where cc.scheduled_payment_id = sp.id
  and sp.credit_card_id is null;
