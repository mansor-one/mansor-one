-- Project Phoenix legacy row mapping report.
--
-- Purpose:
--   Produce a read-only row-by-row migration map from legacy financial tables
--   into the new target domains.
--
-- Safe to run:
--   This file is SELECT-only. It does not write, delete, archive, or migrate.

with scheduled as (
  select
    'scheduled_payments' as legacy_table,
    id::text as legacy_id,
    name,
    amount::text as amount,
    concat_ws(
      ' ',
      coalesce(recurrence_type, 'monthly'),
      'due_day=' || coalesce(due_day::text, 'null'),
      'grace_day=' || coalesce(grace_day::text, 'null'),
      'active_months=' || coalesce(active_months, 'all')
    ) as frequency_date,
    case
      when lower(coalesce(category, '')) = 'credit card'
        or lower(name) in ('popular visa', 'us bank', 'synchrony', 'chase')
        then 'obligations/cards'
      else 'obligations'
    end as target_domain,
    case
      when lower(coalesce(category, '')) = 'credit card'
        or lower(name) in ('popular visa', 'us bank', 'synchrony', 'chase')
        then 'Defer until Cards domain confirms ownership; create obligation only if Cards needs lifecycle bridge.'
      else 'Create/merge obligation profile; generate current and future obligation_instances; preserve payment history via links.'
    end as target_action,
    case
      when lower(name) in ('guagua soraya') then 'medium'
      when lower(coalesce(category, '')) = 'credit card'
        or lower(name) in ('popular visa', 'us bank', 'synchrony', 'chase')
        then 'medium'
      else 'high'
    end as confidence,
    concat_ws(
      ' | ',
      'owner=' || coalesce(owner, ''),
      'category=' || coalesce(category, ''),
      nullif(notes, ''),
      nullif(custom_schedule_notes, '')
    ) as notes
  from public.scheduled_payments
),
instances as (
  select
    'payment_instances' as legacy_table,
    id::text as legacy_id,
    name,
    amount::text as amount,
    concat_ws(
      ' ',
      payment_year || '-' || lpad(payment_month::text, 2, '0'),
      'effective_due_date=' || coalesce(effective_due_date::text, 'null'),
      'status=' || coalesce(status, '')
    ) as frequency_date,
    'ledger/history + obligation_payment_links' as target_domain,
    'Do not migrate as obligation definition. Link to matching obligation_instance when confidence is high; preserve row as historical payment state.' as target_action,
    case when scheduled_payment_id is not null then 'high' else 'medium' end as confidence,
    concat_ws(
      ' | ',
      'scheduled_payment_id=' || coalesce(scheduled_payment_id::text, ''),
      'owner=' || coalesce(owner, ''),
      'category=' || coalesce(category, ''),
      nullif(notes, '')
    ) as notes
  from public.payment_instances
),
future as (
  select
    'future_obligations' as legacy_table,
    id::text as legacy_id,
    name,
    estimated_amount::text as amount,
    concat_ws(
      ' ',
      'target_date=' || coalesce(target_date::text, 'null'),
      'status=' || coalesce(status, ''),
      'reserve=' || coalesce(monthly_reserve::text, 'null')
    ) as frequency_date,
    'planning_items' as target_domain,
    'Already or should be represented as planning/reserve item; do not create recurring obligation unless user confirms recurrence.' as target_action,
    'high' as confidence,
    concat_ws(
      ' | ',
      'category=' || coalesce(category, ''),
      'priority=' || coalesce(priority, ''),
      nullif(notes, '')
    ) as notes
  from public.future_obligations
),
debts as (
  select
    'liabilities' as legacy_table,
    id::text as legacy_id,
    name,
    monthly_payment::text as amount,
    concat_ws(
      ' ',
      'due_day=' || coalesce(due_day::text, 'null'),
      'grace_day=' || coalesce(grace_day::text, 'null'),
      'balance=' || coalesce(balance::text, 'null'),
      'remaining=' || coalesce(remaining_payments::text, 'null')
    ) as frequency_date,
    case
      when lower(liability_type) in ('auto_loan', 'mortgage')
        then 'obligations + liabilities history'
      else 'liabilities history'
    end as target_domain,
    case
      when lower(name) like '%honda%'
        then 'Merge with scheduled_payments Guagua Soraya into one Honda obligation; keep liability payoff metadata.'
      when lower(name) like '%hipoteca%'
        then 'Merge with scheduled_payments Hipoteca into one mortgage obligation; keep liability payoff metadata.'
      when lower(name) like '%toyota%'
        then 'Create Toyota obligation from liability; no scheduled_payment duplicate found.'
      else 'Keep as liability history unless recurring payment lifecycle is needed.'
    end as target_action,
    case
      when lower(name) like '%honda%' then 'high'
      when lower(name) like '%hipoteca%' then 'high'
      when lower(name) like '%toyota%' then 'high'
      else 'medium'
    end as confidence,
    concat_ws(
      ' | ',
      'type=' || coalesce(liability_type, ''),
      'lender=' || coalesce(lender, ''),
      'owner=' || coalesce(owner, ''),
      nullif(notes, '')
    ) as notes
  from public.liabilities
),
planning as (
  select
    'planning_items' as legacy_table,
    id::text as legacy_id,
    name,
    target_amount::text as amount,
    concat_ws(
      ' ',
      'due_date=' || coalesce(due_date::text, 'null'),
      'status=' || coalesce(status, ''),
      'item_type=' || coalesce(item_type, '')
    ) as frequency_date,
    'planning_items' as target_domain,
    case
      when legacy_source is not null
        then 'Already migrated/consolidated; keep in planning and avoid duplicate migration.'
      when is_completed
        then 'Keep completed planning history; no migration needed.'
      else 'Keep as active planning item; do not convert to obligation unless recurring commitment is confirmed.'
    end as target_action,
    case when legacy_source is not null then 'high' else 'medium' end as confidence,
    concat_ws(
      ' | ',
      'owner=' || coalesce(owner, ''),
      'category=' || coalesce(category, ''),
      'legacy_source=' || coalesce(legacy_source, ''),
      'legacy_id=' || coalesce(legacy_id::text, ''),
      nullif(notes, '')
    ) as notes
  from public.planning_items
),
manual_accounts as (
  select
    'accounts' as legacy_table,
    id::text as legacy_id,
    name,
    balance::text as amount,
    concat_ws(
      ' ',
      'account_type=' || coalesce(account_type, ''),
      'active=' || coalesce(is_active::text, 'null'),
      'spendable=' || coalesce(is_spendable::text, 'null')
    ) as frequency_date,
    'accounts/assets' as target_domain,
    case
      when is_active and is_spendable
        then 'Keep until explicit manual-account inclusion/exclusion flag exists; do not migrate to obligations.'
      when not is_active
        then 'Archive account identity after historical ledger references are verified.'
      else 'Keep as non-spendable asset/account identity.'
    end as target_action,
    'high' as confidence,
    concat_ws(
      ' | ',
      'owner_id=' || coalesce(owner_id::text, ''),
      'currency=' || coalesce(currency, '')
    ) as notes
  from public.accounts
)
select * from scheduled
union all select * from instances
union all select * from future
union all select * from debts
union all select * from planning
union all select * from manual_accounts
order by legacy_table, name, legacy_id;
