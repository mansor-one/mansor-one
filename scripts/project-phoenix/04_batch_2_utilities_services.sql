-- Project Phoenix Batch 2: utilities and services.
--
-- Prepared only. Do not run until Manuel approves Batch 2 execution.
--
-- Scope:
-- - Migrate now: Internet, Agua / AAA, Luz / LUMA, SunRun, Grama.
-- - Defer: Celulares, Barbero.
-- - Do not delete, archive, or update legacy scheduled_payments rows.
--
-- This script writes public.obligations, public.obligation_providers and
-- public.obligation_instances only. It intentionally keeps the legacy
-- scheduled_payments rows intact while adding Project Phoenix source metadata
-- to obligation notes so the Financial Engine lifecycle bridge can suppress
-- duplicate scheduled_payments pressure.
--
-- Live compatibility:
-- The live obligations table still has legacy columns such as person, title,
-- amount, due_date, recurrence, priority and active. This script writes both
-- the new ADR fields and the legacy fields so NOT NULL legacy constraints are
-- satisfied during the transition.

begin;

drop table if exists pg_temp.phoenix_batch_2_scope;
drop table if exists pg_temp.phoenix_batch_2_seed;

create temp table phoenix_batch_2_scope (
  legacy_scheduled_payment_id uuid primary key,
  expected_legacy_name text not null,
  canonical_name text not null,
  name_match text[] not null,
  category_code text not null,
  owner text not null,
  obligation_type text not null,
  frequency text not null,
  payment_method text,
  provider_name text,
  provider_payment_method text,
  amount_is_estimated boolean not null,
  migrate_now boolean not null,
  deferral_reason text,
  description text not null,
  notes_prefix text not null
) on commit preserve rows;

insert into phoenix_batch_2_scope (
  legacy_scheduled_payment_id,
  expected_legacy_name,
  canonical_name,
  name_match,
  category_code,
  owner,
  obligation_type,
  frequency,
  payment_method,
  provider_name,
  provider_payment_method,
  amount_is_estimated,
  migrate_now,
  deferral_reason,
  description,
  notes_prefix
)
values
  (
    '406f0a86-34da-4c31-b174-93388ea8dc2e',
    'Internet',
    'Internet',
    array['internet', 'liberty/internet', 'liberty internet'],
    'utilities_internet',
    'household',
    'utility',
    'monthly',
    null,
    null,
    null,
    false,
    true,
    null,
    'Household internet service.',
    'Project Phoenix Batch 2. Migrated from scheduled_payments.406f0a86-34da-4c31-b174-93388ea8dc2e Internet. Provider not confirmed in legacy mapping; possible Liberty/internet.'
  ),
  (
    'ef7ee92b-2b22-4f60-8b82-3acaec42930c',
    'Agua / AAA',
    'Agua / AAA',
    array['agua / aaa', 'agua', 'aaa', 'prasa'],
    'utilities_water',
    'household',
    'utility',
    'monthly',
    null,
    'AAA',
    null,
    false,
    true,
    null,
    'Household water utility.',
    'Project Phoenix Batch 2. Migrated from scheduled_payments.ef7ee92b-2b22-4f60-8b82-3acaec42930c Agua / AAA.'
  ),
  (
    '81071b2b-5f16-41ca-8838-3a359dc595ad',
    'Luz / LUMA',
    'Luz / LUMA',
    array['luz / luma', 'luz', 'luma'],
    'utilities_electricity',
    'household',
    'utility',
    'monthly',
    null,
    'LUMA',
    null,
    false,
    true,
    null,
    'Household electricity utility.',
    'Project Phoenix Batch 2. Migrated from scheduled_payments.81071b2b-5f16-41ca-8838-3a359dc595ad Luz / LUMA.'
  ),
  (
    '9ae616f7-6746-4214-810a-eb16c5959425',
    'SunRun',
    'SunRun',
    array['sunrun', 'sun run', 'solar'],
    'utilities_electricity',
    'household',
    'utility',
    'monthly',
    'autopay',
    'SunRun',
    'autopay',
    false,
    true,
    null,
    'Household solar service.',
    'Project Phoenix Batch 2. Migrated from scheduled_payments.9ae616f7-6746-4214-810a-eb16c5959425 SunRun. Payment lifecycle docs describe SunRun as expected/autopay/confirmed by transaction, with no separate special code path found.'
  ),
  (
    '8b7a4374-c882-433b-ac15-5a6818ae1bcb',
    'Grama',
    'Grama',
    array['grama', 'recorte de grama', 'lawn service'],
    'housing_yard_maintenance',
    'household',
    'service',
    'monthly',
    'ATH Movil',
    null,
    'ATH Movil',
    false,
    true,
    null,
    'Household lawn service.',
    'Project Phoenix Batch 2. Migrated from scheduled_payments.8b7a4374-c882-433b-ac15-5a6818ae1bcb Grama. Provider can change; preserve provider history separately when verified.'
  ),
  (
    '6653e7dd-30a4-4e8b-b863-efae0f9da49d',
    'Celulares',
    'Celulares',
    array['celulares', 'cell phones', 'phone'],
    'utilities_phone',
    'household',
    'utility',
    'monthly',
    null,
    null,
    null,
    false,
    false,
    'Deferred: shared/family bill details and due-day behavior are unclear in the legacy mapping.',
    'Household phone service.',
    'Project Phoenix Batch 2 deferred. Source scheduled_payments.6653e7dd-30a4-4e8b-b863-efae0f9da49d Celulares.'
  ),
  (
    '187b90d1-c545-4b5e-ac42-0857784578cc',
    'Barbero',
    'Barbero',
    array['barbero', 'barber'],
    'health_beauty_personal_care',
    'household',
    'service',
    'custom',
    'ATH Movil',
    null,
    'ATH Movil',
    false,
    false,
    'Deferred: legacy mapping says this follows payday; current obligation_instances can model monthly dates but not a payday-based cadence safely.',
    'Household barber service.',
    'Project Phoenix Batch 2 deferred. Source scheduled_payments.187b90d1-c545-4b5e-ac42-0857784578cc Barbero.'
  );

do $$
declare
  mansor_user_id constant uuid := '376aeb27-8cbb-46c4-89b5-9da0a59e5364';
  missing_count integer;
  changed_row record;
begin
  if not exists (
    select 1
    from auth.users
    where id = mansor_user_id
  ) then
    raise exception 'Mansor household user_id % was not found in auth.users.', mansor_user_id;
  end if;

  select count(*)
  into missing_count
  from phoenix_batch_2_scope scope
  left join public.scheduled_payments legacy
    on legacy.id = scope.legacy_scheduled_payment_id
  where legacy.id is null;

  if missing_count > 0 then
    raise exception 'Project Phoenix Batch 2 expected % scheduled_payments rows that were not found.', missing_count;
  end if;

  select
    scope.expected_legacy_name,
    scope.name_match,
    legacy.name as actual_legacy_name,
    scope.legacy_scheduled_payment_id
  into changed_row
  from phoenix_batch_2_scope scope
  join public.scheduled_payments legacy
    on legacy.id = scope.legacy_scheduled_payment_id
  where lower(legacy.name) <> all(scope.name_match)
  order by scope.expected_legacy_name
  limit 1;

  if found then
    raise exception
      'Project Phoenix Batch 2 expected scheduled_payments.% to be named one of %, but found %.',
      changed_row.legacy_scheduled_payment_id,
      changed_row.name_match,
      changed_row.actual_legacy_name;
  end if;
end $$;

create temp table phoenix_batch_2_seed as
with target_user as (
  select '376aeb27-8cbb-46c4-89b5-9da0a59e5364'::uuid as user_id
),
legacy_rows as (
  select
    scope.*,
    legacy.name as legacy_name,
    legacy.amount as legacy_amount,
    legacy.due_day as legacy_due_day,
    legacy.grace_day as legacy_grace_day,
    legacy.category as legacy_category,
    legacy.owner as legacy_owner,
    legacy.is_active as legacy_is_active,
    legacy.active_months as legacy_active_months,
    legacy.notes as legacy_notes,
    legacy.created_at as legacy_created_at
  from phoenix_batch_2_scope scope
  join public.scheduled_payments legacy
    on legacy.id = scope.legacy_scheduled_payment_id
)
select
  target_user.user_id,
  legacy_rows.legacy_scheduled_payment_id,
  legacy_rows.expected_legacy_name,
  legacy_rows.canonical_name,
  legacy_rows.name_match,
  legacy_rows.category_code,
  legacy_rows.owner,
  legacy_rows.obligation_type,
  legacy_rows.frequency,
  legacy_rows.payment_method,
  legacy_rows.provider_name,
  legacy_rows.provider_payment_method,
  legacy_rows.amount_is_estimated,
  legacy_rows.migrate_now,
  legacy_rows.deferral_reason,
  legacy_rows.description,
  legacy_rows.legacy_amount::numeric as default_amount,
  legacy_rows.legacy_due_day as due_day,
  case
    when legacy_rows.legacy_due_day is null then 0
    when legacy_rows.legacy_grace_day is null then 0
    when legacy_rows.legacy_grace_day >= legacy_rows.legacy_due_day
      then legacy_rows.legacy_grace_day - legacy_rows.legacy_due_day
    else legacy_rows.legacy_grace_day
  end as grace_period_days,
  legacy_rows.owner as legacy_person,
  legacy_rows.canonical_name as legacy_title,
  legacy_rows.legacy_amount::numeric as legacy_amount,
  case
    when legacy_rows.legacy_due_day is null then null::date
    else make_date(
      2026,
      7,
      least(legacy_rows.legacy_due_day, extract(day from date '2026-07-31')::integer)
    )
  end as legacy_due_date,
  legacy_rows.frequency as legacy_recurrence,
  2::integer as legacy_priority,
  true as legacy_active,
  concat_ws(
    ' ',
    legacy_rows.notes_prefix,
    case
      when legacy_rows.legacy_notes is not null
        then concat('Legacy notes:', legacy_rows.legacy_notes)
      else null
    end,
    concat('Legacy active_months:', coalesce(legacy_rows.legacy_active_months, 'all')),
    case
      when not legacy_rows.migrate_now
        then concat('Deferred reason:', legacy_rows.deferral_reason)
      else null
    end
  ) as notes
from target_user
cross join legacy_rows
where legacy_rows.migrate_now;

do $$
declare
  duplicate_match record;
begin
  with existing_matches as (
    select
      seed.canonical_name,
      count(*) as matching_obligations
    from phoenix_batch_2_seed seed
    join public.obligations obligation
      on obligation.user_id = seed.user_id
     and lower(obligation.name) = any(seed.name_match)
    group by seed.canonical_name
  )
  select *
  into duplicate_match
  from existing_matches
  where matching_obligations > 1
  order by canonical_name
  limit 1;

  if found then
    raise exception
      'Project Phoenix Batch 2 found % pre-existing obligations matching %. Resolve duplicates manually before running.',
      duplicate_match.matching_obligations,
      duplicate_match.canonical_name;
  end if;
end $$;

with matched_existing as (
  select distinct on (seed.canonical_name)
    seed.canonical_name,
    obligation.id as obligation_id
  from phoenix_batch_2_seed seed
  join public.obligations obligation
    on obligation.user_id = seed.user_id
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
  from phoenix_batch_2_seed seed
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
  seed.user_id,
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
from phoenix_batch_2_seed seed
where not exists (
  select 1
  from matched_existing existing
  where existing.canonical_name = seed.canonical_name
);

with target_obligations as (
  select
    seed.*,
    obligation.id as obligation_id
  from phoenix_batch_2_seed seed
  join public.obligations obligation
    on obligation.user_id = seed.user_id
   and lower(obligation.name) = lower(seed.canonical_name)
),
provider_seed as (
  select
    target_obligations.user_id,
    target_obligations.obligation_id,
    target_obligations.provider_name,
    null::text as phone,
    target_obligations.provider_payment_method as payment_method,
    date '2026-07-01' as active_from,
    null::date as active_until,
    concat(
      'Project Phoenix Batch 2 provider seed for ',
      target_obligations.canonical_name,
      ' from scheduled_payments.',
      target_obligations.legacy_scheduled_payment_id
    ) as notes
  from target_obligations
  where target_obligations.provider_name is not null
)
insert into public.obligation_providers (
  user_id,
  obligation_id,
  provider_name,
  phone,
  payment_method,
  active_from,
  active_until,
  notes
)
select
  provider_seed.user_id,
  provider_seed.obligation_id,
  provider_seed.provider_name,
  provider_seed.phone,
  provider_seed.payment_method,
  provider_seed.active_from,
  provider_seed.active_until,
  provider_seed.notes
from provider_seed
where not exists (
  select 1
  from public.obligation_providers existing
  where existing.user_id = provider_seed.user_id
    and existing.obligation_id = provider_seed.obligation_id
    and lower(existing.provider_name) = lower(provider_seed.provider_name)
    and existing.active_from is not distinct from provider_seed.active_from
);

with target_obligations as (
  select
    seed.*,
    obligation.id as obligation_id
  from phoenix_batch_2_seed seed
  join public.obligations obligation
    on obligation.user_id = seed.user_id
   and lower(obligation.name) = lower(seed.canonical_name)
),
current_providers as (
  select distinct on (provider.obligation_id)
    provider.obligation_id,
    provider.id as provider_id
  from public.obligation_providers provider
  join target_obligations obligation
    on obligation.obligation_id = provider.obligation_id
  where provider.active_until is null
  order by provider.obligation_id, provider.active_from desc nulls last, provider.created_at desc
),
expected_instances as (
  select
    target_obligations.user_id,
    target_obligations.obligation_id,
    current_providers.provider_id,
    make_date(
      extract(year from cycle.cycle_month)::integer,
      extract(month from cycle.cycle_month)::integer,
      least(
        target_obligations.due_day,
        extract(day from (
          date_trunc('month', cycle.cycle_month)::date + interval '1 month - 1 day'
        ))::integer
      )
    ) as expected_date,
    (
      make_date(
        extract(year from cycle.cycle_month)::integer,
        extract(month from cycle.cycle_month)::integer,
        least(
          target_obligations.due_day,
          extract(day from (
            date_trunc('month', cycle.cycle_month)::date + interval '1 month - 1 day'
          ))::integer
        )
      ) + target_obligations.grace_period_days
    )::date as effective_due_date,
    target_obligations.default_amount as amount_expected,
    target_obligations.amount_is_estimated,
    'pending'::text as status,
    'generated'::text as source,
    concat(
      'Project Phoenix Batch 2 generated July/August 2026 utility/service cycle. Source scheduled_payments.',
      target_obligations.legacy_scheduled_payment_id
    ) as notes
  from target_obligations
  left join current_providers
    on current_providers.obligation_id = target_obligations.obligation_id
  cross join (
    values
      (date '2026-07-01'),
      (date '2026-08-01')
  ) as cycle(cycle_month)
  where target_obligations.due_day is not null
),
updated_instances as (
  update public.obligation_instances instance
  set
    provider_id = expected.provider_id,
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
  provider_id,
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
  expected.provider_id,
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
-- Run after the transaction to verify Batch 2 without changing legacy rows.
with scope as (
  select *
  from (
    values
      (
        '406f0a86-34da-4c31-b174-93388ea8dc2e'::uuid,
        'Internet',
        'Internet',
        array['internet', 'liberty/internet', 'liberty internet'],
        true,
        null::text
      ),
      (
        'ef7ee92b-2b22-4f60-8b82-3acaec42930c'::uuid,
        'Agua / AAA',
        'Agua / AAA',
        array['agua / aaa', 'agua', 'aaa', 'prasa'],
        true,
        null::text
      ),
      (
        '81071b2b-5f16-41ca-8838-3a359dc595ad'::uuid,
        'Luz / LUMA',
        'Luz / LUMA',
        array['luz / luma', 'luz', 'luma'],
        true,
        null::text
      ),
      (
        '9ae616f7-6746-4214-810a-eb16c5959425'::uuid,
        'SunRun',
        'SunRun',
        array['sunrun', 'sun run', 'solar'],
        true,
        null::text
      ),
      (
        '8b7a4374-c882-433b-ac15-5a6818ae1bcb'::uuid,
        'Grama',
        'Grama',
        array['grama', 'recorte de grama', 'lawn service'],
        true,
        null::text
      ),
      (
        '6653e7dd-30a4-4e8b-b863-efae0f9da49d'::uuid,
        'Celulares',
        'Celulares',
        array['celulares', 'cell phones', 'phone'],
        false,
        'deferred_unclear_family_bill'
      ),
      (
        '187b90d1-c545-4b5e-ac42-0857784578cc'::uuid,
        'Barbero',
        'Barbero',
        array['barbero', 'barber'],
        false,
        'deferred_payday_based'
      )
  ) as row(
    legacy_scheduled_payment_id,
    expected_legacy_name,
    canonical_name,
    allowed_legacy_names,
    migrate_now,
    deferral_code
  )
),
legacy_rows as (
  select
    scope.*,
    legacy.id as legacy_id,
    legacy.name as legacy_name,
    legacy.amount as legacy_amount,
    legacy.due_day as legacy_due_day,
    legacy.grace_day as legacy_grace_day,
    legacy.is_active as legacy_is_active
  from scope
  left join public.scheduled_payments legacy
    on legacy.id = scope.legacy_scheduled_payment_id
),
actual_obligations as (
  select obligation.*
  from public.obligations obligation
  where obligation.user_id = '376aeb27-8cbb-46c4-89b5-9da0a59e5364'
    and lower(obligation.name) in (
      'internet',
      'agua / aaa',
      'luz / luma',
      'sunrun',
      'grama',
      'celulares',
      'barbero'
    )
),
instance_counts as (
  select
    obligation.name,
    count(*) filter (where instance.status <> 'cancelled') as active_instance_count,
    count(*) filter (
      where instance.status <> 'cancelled'
        and instance.expected_date in (date '2026-07-01', date '2026-08-01')
    ) as first_day_instance_count,
    count(*) filter (
      where instance.status <> 'cancelled'
        and instance.expected_date >= date '2026-07-01'
        and instance.expected_date < date '2026-09-01'
    ) as july_august_instance_count
  from actual_obligations obligation
  left join public.obligation_instances instance
    on instance.obligation_id = obligation.id
  group by obligation.name
)
select
  legacy_rows.canonical_name,
  legacy_rows.legacy_scheduled_payment_id,
  legacy_rows.legacy_name,
  legacy_rows.legacy_amount,
  legacy_rows.legacy_due_day,
  legacy_rows.legacy_grace_day,
  legacy_rows.migrate_now,
  legacy_rows.deferral_code,
  actual_obligations.id as obligation_id,
  actual_obligations.default_amount as obligation_amount,
  actual_obligations.due_day as obligation_due_day,
  actual_obligations.grace_period_days,
  actual_obligations.category_code,
  actual_obligations.owner,
  actual_obligations.payment_method,
  coalesce(instance_counts.july_august_instance_count, 0) as july_august_instance_count,
  case
    when legacy_rows.legacy_id is null then 'missing_legacy_row'
    when lower(legacy_rows.legacy_name) <> all(legacy_rows.allowed_legacy_names) then 'legacy_name_mismatch'
    when legacy_rows.migrate_now = false and actual_obligations.id is null then 'deferred_ok'
    when legacy_rows.migrate_now = false and actual_obligations.id is not null then 'deferred_but_obligation_exists'
    when actual_obligations.id is null then 'missing_obligation'
    when actual_obligations.default_amount <> legacy_rows.legacy_amount then 'amount_mismatch'
    when actual_obligations.due_day is distinct from legacy_rows.legacy_due_day then 'due_day_mismatch'
    when coalesce(instance_counts.july_august_instance_count, 0) <> 2 and legacy_rows.legacy_due_day is not null then 'instance_count_mismatch'
    when coalesce(instance_counts.july_august_instance_count, 0) <> 0 and legacy_rows.legacy_due_day is null then 'unexpected_instances_without_due_day'
    else 'ok'
  end as parity_status
from legacy_rows
left join actual_obligations
  on lower(actual_obligations.name) = lower(legacy_rows.canonical_name)
left join instance_counts
  on lower(instance_counts.name) = lower(legacy_rows.canonical_name)
order by
  legacy_rows.migrate_now desc,
  legacy_rows.canonical_name;
