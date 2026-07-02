-- Project Phoenix Batch 1: vehicles and loans.
--
-- Approved scope:
-- - Honda Soraya + Guagua Soraya are the same Honda obligation.
-- - Toyota Corolla Cross should be created from liabilities.
-- - Hipoteca Casa Cayey + Hipoteca are the same mortgage obligation.
-- - Do not migrate cards yet.
-- - Do not migrate utilities/services yet.
-- - Do not delete or archive legacy tables.
--
-- This script is executable but has not been run.
-- It is intentionally limited to public.obligations and
-- public.obligation_instances.
--
-- Live compatibility:
-- The live obligations table still has legacy columns such as person, title,
-- amount, due_date, recurrence, priority and active. This script writes both
-- the new ADR fields and the legacy fields so NOT NULL legacy constraints are
-- satisfied during the transition.
--
-- Historical payment linking is not included here because
-- obligation_payment_links links to quick_entries/plaid_imports, not directly
-- to legacy payment_instances.

begin;

do $$
declare
  mansor_user_id constant uuid := '376aeb27-8cbb-46c4-89b5-9da0a59e5364';
begin
  if not exists (
    select 1
    from auth.users
    where id = mansor_user_id
  ) then
    raise exception 'Mansor household user_id % was not found in auth.users.', mansor_user_id;
  end if;

  if not exists (
    select 1
    from public.liabilities
    where id = '6d5f3910-f2cb-4043-8fae-4f71329bfc97'
      and name = 'Honda Soraya'
      and monthly_payment = 947.78
  ) then
    raise exception 'Expected legacy liability Honda Soraya was not found or changed.';
  end if;

  if not exists (
    select 1
    from public.scheduled_payments
    where id = 'b942563d-261f-401a-abc5-6d5fabbf8f23'
      and name = 'Guagua Soraya'
      and amount = 947.78
  ) then
    raise exception 'Expected legacy scheduled payment Guagua Soraya was not found or changed.';
  end if;

  if not exists (
    select 1
    from public.liabilities
    where id = '0ada3acb-29d2-4958-88a6-283624c7d8e9'
      and name = 'Toyota Corolla Cross'
      and monthly_payment = 778.79
  ) then
    raise exception 'Expected legacy liability Toyota Corolla Cross was not found or changed.';
  end if;

  if not exists (
    select 1
    from public.liabilities
    where id = '634c9d6f-fd5a-433a-ac4e-797fae06233d'
      and name = 'Hipoteca Casa Cayey'
      and monthly_payment = 752.07
  ) then
    raise exception 'Expected legacy liability Hipoteca Casa Cayey was not found or changed.';
  end if;

  if not exists (
    select 1
    from public.scheduled_payments
    where id = '57044a71-1f26-4a29-954d-573dfb0d2ce2'
      and name = 'Hipoteca'
      and amount = 752.07
  ) then
    raise exception 'Expected legacy scheduled payment Hipoteca was not found or changed.';
  end if;
end $$;

do $$
declare
  duplicate_match record;
begin
  with seed(canonical_name, name_match) as (
    values
      ('Honda Soraya', array['honda soraya', 'guagua soraya', 'honda']),
      ('Toyota Corolla Cross', array['toyota corolla cross', 'toyota']),
      ('Hipoteca Casa Cayey', array['hipoteca casa cayey', 'hipoteca'])
  )
  select
    seed.canonical_name,
    count(*) as matching_obligations
  into duplicate_match
  from seed
  join public.obligations obligation
    on obligation.user_id = '376aeb27-8cbb-46c4-89b5-9da0a59e5364'
   and lower(obligation.name) = any(seed.name_match)
  group by seed.canonical_name
  having count(*) > 1
  order by seed.canonical_name
  limit 1;

  if found then
    raise exception
      'Project Phoenix Batch 1 found % pre-existing obligations matching %. Resolve duplicates manually before running.',
      duplicate_match.matching_obligations,
      duplicate_match.canonical_name;
  end if;
end $$;

with seed(
  canonical_name,
  name_match,
  description,
  category_code,
  owner,
  obligation_type,
  default_amount,
  amount_is_estimated,
  frequency,
  due_day,
  grace_period_days,
  payment_method,
  legacy_person,
  legacy_title,
  legacy_amount,
  legacy_due_date,
  legacy_recurrence,
  legacy_priority,
  legacy_active,
  notes
) as (
  values
    (
      'Honda Soraya',
      array['honda soraya', 'guagua soraya', 'honda'],
      'Honda auto loan for Soraya.',
      'debt_auto_loan',
      'Soraya',
      'loan',
      947.78::numeric,
      false,
      'monthly',
      4,
      17,
      null::text,
      'Soraya',
      'Honda Soraya',
      947.78::numeric,
      date '2026-07-04',
      'monthly',
      1,
      true,
      'Project Phoenix Batch 1. Merged from liabilities.6d5f3910-f2cb-4043-8fae-4f71329bfc97 Honda Soraya and scheduled_payments.b942563d-261f-401a-abc5-6d5fabbf8f23 Guagua Soraya. Legacy liability balance 70039.42; remaining payments 74; grace approximately through day 21.'
    ),
    (
      'Toyota Corolla Cross',
      array['toyota corolla cross', 'toyota'],
      'Toyota Corolla Cross auto loan.',
      'debt_auto_loan',
      'Manuel',
      'loan',
      778.79::numeric,
      false,
      'monthly',
      18,
      15,
      null::text,
      'Manuel',
      'Toyota Corolla Cross',
      778.79::numeric,
      date '2026-07-18',
      'monthly',
      1,
      true,
      'Project Phoenix Batch 1. Created from liabilities.0ada3acb-29d2-4958-88a6-283624c7d8e9 Toyota Corolla Cross. No scheduled_payments duplicate was approved. Legacy liability balance 46187.10; remaining payments 79; Manuel confirmed due day 18 plus 15-day grace.'
    ),
    (
      'Hipoteca Casa Cayey',
      array['hipoteca casa cayey', 'hipoteca'],
      'Mortgage for Casa Cayey.',
      'debt_mortgage',
      'Manuel',
      'loan',
      752.07::numeric,
      false,
      'monthly',
      1,
      14,
      null::text,
      'Manuel',
      'Hipoteca Casa Cayey',
      752.07::numeric,
      date '2026-07-01',
      'monthly',
      1,
      true,
      'Project Phoenix Batch 1. Merged from liabilities.634c9d6f-fd5a-433a-ac4e-797fae06233d Hipoteca Casa Cayey and scheduled_payments.57044a71-1f26-4a29-954d-573dfb0d2ce2 Hipoteca. Legacy liability balance 134121.30; remaining payments 296. Scheduled payment used effective due/grace date day 15.'
    )
),
target_user as (
  select '376aeb27-8cbb-46c4-89b5-9da0a59e5364'::uuid as user_id
),
matched_existing as (
  select distinct on (seed.canonical_name)
    seed.canonical_name,
    obligation.id as obligation_id
  from seed
  join target_user on true
  join public.obligations obligation
    on obligation.user_id = target_user.user_id
   and lower(obligation.name) = any(seed.name_match)
  order by seed.canonical_name, obligation.created_at nulls last, obligation.id
),
updated as (
  update public.obligations obligation
  set
    name = seed.canonical_name,
    description = seed.description,
    category_code = seed.category_code,
    owner = seed.owner,
    obligation_type = seed.obligation_type,
    default_amount = seed.default_amount,
    amount_is_estimated = seed.amount_is_estimated,
    frequency = seed.frequency,
    due_day = seed.due_day,
    grace_period_days = seed.grace_period_days,
    payment_method = seed.payment_method,
    is_active = true,
    person = seed.legacy_person,
    title = seed.legacy_title,
    amount = seed.legacy_amount,
    due_date = seed.legacy_due_date,
    recurrence = seed.legacy_recurrence,
    priority = seed.legacy_priority,
    active = seed.legacy_active,
    notes = seed.notes,
    updated_at = now()
  from seed
  join matched_existing existing
    on existing.canonical_name = seed.canonical_name
  where obligation.id = existing.obligation_id
  returning obligation.id
)
insert into public.obligations (
  user_id,
  name,
  description,
  category_code,
  owner,
  obligation_type,
  default_amount,
  amount_is_estimated,
  frequency,
  due_day,
  grace_period_days,
  payment_method,
  is_active,
  person,
  title,
  amount,
  due_date,
  recurrence,
  priority,
  active,
  notes
)
select
  target_user.user_id,
  seed.canonical_name,
  seed.description,
  seed.category_code,
  seed.owner,
  seed.obligation_type,
  seed.default_amount,
  seed.amount_is_estimated,
  seed.frequency,
  seed.due_day,
  seed.grace_period_days,
  seed.payment_method,
  true,
  seed.legacy_person,
  seed.legacy_title,
  seed.legacy_amount,
  seed.legacy_due_date,
  seed.legacy_recurrence,
  seed.legacy_priority,
  seed.legacy_active,
  seed.notes
from target_user
cross join seed
where not exists (
  select 1
  from matched_existing existing
  where existing.canonical_name = seed.canonical_name
);

with target_user as (
  select '376aeb27-8cbb-46c4-89b5-9da0a59e5364'::uuid as user_id
),
target_obligations as (
  select
    obligation.id,
    obligation.user_id,
    obligation.name,
    obligation.default_amount,
    obligation.amount_is_estimated,
    obligation.due_day,
    obligation.grace_period_days
  from public.obligations obligation
  join target_user
    on target_user.user_id = obligation.user_id
  where lower(obligation.name) in (
    'honda soraya',
    'toyota corolla cross',
    'hipoteca casa cayey'
  )
),
expected_instances as (
  select
    obligation.id as obligation_id,
    obligation.user_id,
    make_date(
      extract(year from cycle.cycle_month)::integer,
      extract(month from cycle.cycle_month)::integer,
      obligation.due_day
    ) as expected_date,
    (
      make_date(
        extract(year from cycle.cycle_month)::integer,
        extract(month from cycle.cycle_month)::integer,
        obligation.due_day
      ) + obligation.grace_period_days
    )::date as effective_due_date,
    obligation.default_amount as amount_expected,
    obligation.amount_is_estimated,
    'pending'::text as status,
    'generated'::text as source,
    'Project Phoenix Batch 1 generated July/August 2026 loan cycle.'::text as notes
  from target_obligations obligation
  cross join (
    values
      (date '2026-07-01'),
      (date '2026-08-01')
  ) as cycle(cycle_month)
  where obligation.due_day is not null
),
updated_instances as (
  update public.obligation_instances instance
  set
    effective_due_date = expected.effective_due_date,
    amount_expected = expected.amount_expected,
    amount_is_estimated = expected.amount_is_estimated,
    status = expected.status,
    source = expected.source,
    notes = expected.notes,
    updated_at = now()
  from expected_instances expected
  where instance.user_id = expected.user_id
    and instance.obligation_id = expected.obligation_id
    and instance.expected_date = expected.expected_date
    and instance.status <> 'cancelled'
    and instance.source = 'generated'
  returning instance.id
)
insert into public.obligation_instances (
  user_id,
  obligation_id,
  expected_date,
  effective_due_date,
  amount_expected,
  amount_is_estimated,
  status,
  source,
  notes
)
select
  expected.user_id,
  expected.obligation_id,
  expected.expected_date,
  expected.effective_due_date,
  expected.amount_expected,
  expected.amount_is_estimated,
  expected.status,
  expected.source,
  expected.notes
from expected_instances expected
where not exists (
  select 1
  from public.obligation_instances existing
  where existing.obligation_id = expected.obligation_id
    and existing.expected_date = expected.expected_date
    and existing.status <> 'cancelled'
);

commit;

-- Parity report.
-- Run after the transaction to verify Batch 1 without changing data.
with target_user as (
  select '376aeb27-8cbb-46c4-89b5-9da0a59e5364'::uuid as user_id
),
expected as (
  select *
  from (
    values
      (
        'Honda Soraya',
        947.78::numeric,
        'Soraya',
        'debt_auto_loan',
        'loan',
        4::integer,
        17::integer,
        'Soraya',
        'Honda Soraya',
        947.78::numeric,
        date '2026-07-04',
        'monthly',
        1::integer,
        true,
        array[
          'liabilities.6d5f3910-f2cb-4043-8fae-4f71329bfc97',
          'scheduled_payments.b942563d-261f-401a-abc5-6d5fabbf8f23'
        ]
      ),
      (
        'Toyota Corolla Cross',
        778.79::numeric,
        'Manuel',
        'debt_auto_loan',
        'loan',
        18::integer,
        15::integer,
        'Manuel',
        'Toyota Corolla Cross',
        778.79::numeric,
        date '2026-07-18',
        'monthly',
        1::integer,
        true,
        array[
          'liabilities.0ada3acb-29d2-4958-88a6-283624c7d8e9'
        ]
      ),
      (
        'Hipoteca Casa Cayey',
        752.07::numeric,
        'Manuel',
        'debt_mortgage',
        'loan',
        1::integer,
        14::integer,
        'Manuel',
        'Hipoteca Casa Cayey',
        752.07::numeric,
        date '2026-07-01',
        'monthly',
        1::integer,
        true,
        array[
          'liabilities.634c9d6f-fd5a-433a-ac4e-797fae06233d',
          'scheduled_payments.57044a71-1f26-4a29-954d-573dfb0d2ce2'
        ]
      )
  ) as row(
    name,
    default_amount,
    owner,
    category_code,
    obligation_type,
    due_day,
    grace_period_days,
    legacy_person,
    legacy_title,
    legacy_amount,
    legacy_due_date,
    legacy_recurrence,
    legacy_priority,
    legacy_active,
    legacy_sources
  )
),
actual_obligations as (
  select obligation.*
  from public.obligations obligation
  join target_user on target_user.user_id = obligation.user_id
  where lower(obligation.name) in (
    'honda soraya',
    'toyota corolla cross',
    'hipoteca casa cayey'
  )
),
expected_instances as (
  select
    expected.name,
    make_date(2026, cycle.month_number, expected.due_day) as expected_date,
    (
      make_date(2026, cycle.month_number, expected.due_day) +
      expected.grace_period_days
    )::date as effective_due_date,
    expected.default_amount as amount_expected
  from expected
  cross join (
    values (7), (8)
  ) as cycle(month_number)
),
actual_instances as (
  select
    obligation.name,
    instance.expected_date,
    instance.effective_due_date,
    instance.amount_expected,
    instance.status,
    instance.source
  from public.obligation_instances instance
  join actual_obligations obligation
    on obligation.id = instance.obligation_id
  where instance.status <> 'cancelled'
),
instance_parity as (
  select
    expected_instances.name,
    count(actual_instances.expected_date) as actual_instance_count,
    count(*) filter (
      where actual_instances.expected_date is not null
        and actual_instances.effective_due_date = expected_instances.effective_due_date
        and actual_instances.amount_expected = expected_instances.amount_expected
        and actual_instances.status = 'pending'
    ) as matching_instance_count
  from expected_instances
  left join actual_instances
    on actual_instances.name = expected_instances.name
   and actual_instances.expected_date = expected_instances.expected_date
  group by expected_instances.name
),
legacy_counts as (
  select
    (select count(*) from public.liabilities where id in (
      '6d5f3910-f2cb-4043-8fae-4f71329bfc97',
      '0ada3acb-29d2-4958-88a6-283624c7d8e9',
      '634c9d6f-fd5a-433a-ac4e-797fae06233d'
    )) as liability_rows,
    (select count(*) from public.scheduled_payments where id in (
      'b942563d-261f-401a-abc5-6d5fabbf8f23',
      '57044a71-1f26-4a29-954d-573dfb0d2ce2'
    )) as scheduled_payment_rows
)
select
  expected.name,
  actual_obligations.id as obligation_id,
  case
    when actual_obligations.id is null then 'missing'
    when actual_obligations.default_amount <> expected.default_amount then 'amount_mismatch'
    when actual_obligations.owner <> expected.owner then 'owner_mismatch'
    when actual_obligations.category_code <> expected.category_code then 'category_mismatch'
    when actual_obligations.obligation_type <> expected.obligation_type then 'type_mismatch'
    when actual_obligations.due_day is distinct from expected.due_day then 'due_day_mismatch'
    when actual_obligations.grace_period_days <> expected.grace_period_days then 'grace_period_mismatch'
    when actual_obligations.person <> expected.legacy_person then 'legacy_person_mismatch'
    when actual_obligations.title <> expected.legacy_title then 'legacy_title_mismatch'
    when actual_obligations.amount <> expected.legacy_amount then 'legacy_amount_mismatch'
    when actual_obligations.due_date <> expected.legacy_due_date then 'legacy_due_date_mismatch'
    when actual_obligations.recurrence <> expected.legacy_recurrence then 'legacy_recurrence_mismatch'
    when actual_obligations.priority <> expected.legacy_priority then 'legacy_priority_mismatch'
    when actual_obligations.active <> expected.legacy_active then 'legacy_active_mismatch'
    when instance_parity.matching_instance_count <> 2 then 'instance_mismatch'
    else 'ok'
  end as parity_status,
  expected.default_amount as expected_amount,
  actual_obligations.default_amount as actual_amount,
  expected.owner as expected_owner,
  actual_obligations.owner as actual_owner,
  expected.category_code as expected_category_code,
  actual_obligations.category_code as actual_category_code,
  expected.due_day as expected_due_day,
  actual_obligations.due_day as actual_due_day,
  expected.grace_period_days as expected_grace_period_days,
  actual_obligations.grace_period_days as actual_grace_period_days,
  expected.legacy_person as expected_legacy_person,
  actual_obligations.person as actual_legacy_person,
  expected.legacy_title as expected_legacy_title,
  actual_obligations.title as actual_legacy_title,
  expected.legacy_due_date as expected_legacy_due_date,
  actual_obligations.due_date as actual_legacy_due_date,
  instance_parity.actual_instance_count,
  instance_parity.matching_instance_count,
  expected.legacy_sources,
  legacy_counts.liability_rows,
  legacy_counts.scheduled_payment_rows
from expected
cross join legacy_counts
left join actual_obligations
  on lower(actual_obligations.name) = lower(expected.name)
left join instance_parity
  on instance_parity.name = expected.name
order by expected.name;
