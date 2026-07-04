-- Project Phoenix obligation candidates cleanup.
--
-- Scope:
-- - Cuota Urbanización: migrate confirmed monthly obligation from legacy
--   scheduled_payments row named Seguro Casa.
-- - Seguro Poliza Guagua - Soraya: repair the existing obligation if it is the
--   same policy; do not create a duplicate.
-- - Do not delete, archive, or update legacy scheduled_payments rows.
-- - Do not delete or update archived planning_items rows.
--
-- This script writes public.obligations and public.obligation_instances only.
-- Source references are preserved in notes so the Financial Engine lifecycle
-- bridge can identify legacy scheduled payment relationships.

begin;

drop table if exists pg_temp.phoenix_obligation_candidates_scope;
drop table if exists pg_temp.phoenix_obligation_candidates_seed;

create temp table phoenix_obligation_candidates_scope (
  canonical_name text primary key,
  name_match text[] not null,
  legacy_scheduled_payment_id uuid,
  archived_planning_item_id uuid,
  category_code text not null,
  owner text not null,
  obligation_type text not null,
  frequency text not null,
  default_amount numeric not null,
  amount_is_estimated boolean not null,
  due_day integer not null,
  grace_period_days integer not null,
  payment_method text,
  description text not null,
  legacy_person text not null,
  legacy_due_date date not null,
  instance_months date[] not null,
  notes_prefix text not null
) on commit preserve rows;

insert into phoenix_obligation_candidates_scope (
  canonical_name,
  name_match,
  legacy_scheduled_payment_id,
  archived_planning_item_id,
  category_code,
  owner,
  obligation_type,
  frequency,
  default_amount,
  amount_is_estimated,
  due_day,
  grace_period_days,
  payment_method,
  description,
  legacy_person,
  legacy_due_date,
  instance_months,
  notes_prefix
)
values
  (
    'Cuota Urbanización',
    array['cuota urbanizacion', 'cuota urbanización', 'seguro casa'],
    '16c627ab-97c5-4d23-806a-6dc993f21ced',
    '1544e4fc-571a-4021-9636-b32f1b2e79ee',
    'housing_home_maintenance',
    'Manuel',
    'service',
    'monthly',
    80.00,
    false,
    1,
    14,
    null,
    'Monthly household urbanization/community fee. Due on day 1 with grace through day 15.',
    'Manuel',
    date '2026-07-01',
    array[date '2026-07-01', date '2026-08-01'],
    'Project Phoenix obligation candidates cleanup. Migrated from scheduled_payments.16c627ab-97c5-4d23-806a-6dc993f21ced Seguro Casa after Planning cleanup renamed the candidate to Cuota Urbanización. Legacy scheduled payment notes say due on day 1 with grace through day 15.'
  ),
  (
    'Seguro Poliza Guagua - Soraya',
    array['seguro poliza guagua - soraya', 'seguro poliza guagua', 'seguro póliza guagua - soraya', 'seguro póliza guagua'],
    null,
    'c79405f3-d49d-4895-a395-c6eb92e8046e',
    'insurance_auto',
    'Soraya',
    'insurance',
    'annual',
    1200.00,
    false,
    1,
    0,
    null,
    'Annual vehicle insurance renewal for Soraya.',
    'Soraya',
    date '2026-08-01',
    array[date '2026-08-01', date '2027-08-01'],
    'Project Phoenix obligation candidates cleanup. Repaired existing Seguro Poliza Guagua obligation from archived planning_items.c79405f3-d49d-4895-a395-c6eb92e8046e; annual renewal amount confirmed at 1200 due 2026-08-01.'
  );

do $$
declare
  mansor_user_id constant uuid := '376aeb27-8cbb-46c4-89b5-9da0a59e5364';
  missing_count integer;
  changed_row record;
  duplicate_match record;
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
  from phoenix_obligation_candidates_scope scope
  left join public.scheduled_payments legacy
    on legacy.id = scope.legacy_scheduled_payment_id
  where scope.legacy_scheduled_payment_id is not null
    and legacy.id is null;

  if missing_count > 0 then
    raise exception 'Expected % legacy scheduled_payments rows were not found.', missing_count;
  end if;

  select
    scope.canonical_name,
    scope.legacy_scheduled_payment_id,
    legacy.name as actual_name,
    legacy.amount as actual_amount,
    legacy.is_active as actual_is_active
  into changed_row
  from phoenix_obligation_candidates_scope scope
  join public.scheduled_payments legacy
    on legacy.id = scope.legacy_scheduled_payment_id
  where scope.legacy_scheduled_payment_id is not null
    and (
      lower(legacy.name) <> 'seguro casa'
      or legacy.amount <> 80.00
      or legacy.is_active is distinct from true
    )
  order by scope.canonical_name
  limit 1;

  if found then
    raise exception
      'Legacy scheduled payment % for % changed unexpectedly: name %, amount %, active %.',
      changed_row.legacy_scheduled_payment_id,
      changed_row.canonical_name,
      changed_row.actual_name,
      changed_row.actual_amount,
      changed_row.actual_is_active;
  end if;

  with existing_matches as (
    select
      scope.canonical_name,
      count(*) as matching_obligations,
      array_agg(obligation.name order by obligation.name) as matching_names
    from phoenix_obligation_candidates_scope scope
    join public.obligations obligation
      on obligation.user_id = mansor_user_id
     and lower(obligation.name) = any(scope.name_match || array[lower(scope.canonical_name)])
    group by scope.canonical_name
  )
  select *
  into duplicate_match
  from existing_matches
  where matching_obligations > 1
  order by canonical_name
  limit 1;

  if found then
    raise exception
      'Found % matching obligations for %: %. Resolve duplicates before running.',
      duplicate_match.matching_obligations,
      duplicate_match.canonical_name,
      duplicate_match.matching_names;
  end if;
end $$;

create temp table phoenix_obligation_candidates_seed as
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
    legacy.notes as legacy_notes
  from phoenix_obligation_candidates_scope scope
  left join public.scheduled_payments legacy
    on legacy.id = scope.legacy_scheduled_payment_id
)
select
  target_user.user_id,
  legacy_rows.canonical_name,
  legacy_rows.name_match,
  legacy_rows.legacy_scheduled_payment_id,
  legacy_rows.archived_planning_item_id,
  legacy_rows.category_code,
  legacy_rows.owner,
  legacy_rows.obligation_type,
  legacy_rows.frequency,
  legacy_rows.default_amount,
  legacy_rows.amount_is_estimated,
  legacy_rows.due_day,
  legacy_rows.grace_period_days,
  legacy_rows.payment_method,
  legacy_rows.description,
  legacy_rows.legacy_person,
  legacy_rows.canonical_name as legacy_title,
  legacy_rows.default_amount as legacy_amount,
  legacy_rows.legacy_due_date,
  legacy_rows.frequency as legacy_recurrence,
  2::integer as legacy_priority,
  true as legacy_active,
  legacy_rows.instance_months,
  concat_ws(
    ' ',
    legacy_rows.notes_prefix,
    case
      when legacy_rows.legacy_scheduled_payment_id is not null
        then concat('Legacy source: scheduled_payments.', legacy_rows.legacy_scheduled_payment_id)
      else null
    end,
    case
      when legacy_rows.archived_planning_item_id is not null
        then concat('Planning source: planning_items.', legacy_rows.archived_planning_item_id)
      else null
    end,
    case
      when legacy_rows.legacy_notes is not null
        then concat('Legacy scheduled payment notes:', legacy_rows.legacy_notes)
      else null
    end,
    case
      when legacy_rows.legacy_active_months is not null
        then concat('Legacy active_months:', legacy_rows.legacy_active_months)
      else null
    end
  ) as notes
from target_user
cross join legacy_rows;

with matched_existing as (
  select distinct on (seed.canonical_name)
    seed.canonical_name,
    obligation.id as obligation_id
  from phoenix_obligation_candidates_seed seed
  join public.obligations obligation
    on obligation.user_id = seed.user_id
   and lower(obligation.name) = any(seed.name_match || array[lower(seed.canonical_name)])
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
  from phoenix_obligation_candidates_seed seed
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
from phoenix_obligation_candidates_seed seed
where not exists (
  select 1
  from matched_existing existing
  where existing.canonical_name = seed.canonical_name
);

with target_obligations as (
  select
    seed.*,
    obligation.id as obligation_id
  from phoenix_obligation_candidates_seed seed
  join public.obligations obligation
    on obligation.user_id = seed.user_id
   and lower(obligation.name) = lower(seed.canonical_name)
),
expected_instances as (
  select
    target_obligations.user_id,
    target_obligations.obligation_id,
    null::uuid as provider_id,
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
      'Project Phoenix obligation candidates cleanup generated current/next lifecycle cycle for ',
      target_obligations.canonical_name,
      '. ',
      case
        when target_obligations.legacy_scheduled_payment_id is not null
          then concat('Legacy source: scheduled_payments.', target_obligations.legacy_scheduled_payment_id, '. ')
        else ''
      end,
      case
        when target_obligations.archived_planning_item_id is not null
          then concat('Planning source: planning_items.', target_obligations.archived_planning_item_id, '.')
        else ''
      end
    ) as notes
  from target_obligations
  cross join lateral unnest(target_obligations.instance_months) as cycle(cycle_month)
),
updated_instances as (
  update public.obligation_instances instance
  set
    provider_id = expected.provider_id,
    effective_due_date = expected.effective_due_date,
    amount_expected = expected.amount_expected,
    amount_is_estimated = expected.amount_is_estimated,
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

do $$
declare
  duplicate_instance record;
begin
  with target_obligations as (
    select
      seed.*,
      obligation.id as obligation_id
    from phoenix_obligation_candidates_seed seed
    join public.obligations obligation
      on obligation.user_id = seed.user_id
     and lower(obligation.name) = lower(seed.canonical_name)
  ),
  expected_dates as (
    select
      target_obligations.canonical_name,
      target_obligations.obligation_id,
      make_date(
        extract(year from cycle.cycle_month)::integer,
        extract(month from cycle.cycle_month)::integer,
        least(
          target_obligations.due_day,
          extract(day from (
            date_trunc('month', cycle.cycle_month)::date + interval '1 month - 1 day'
          ))::integer
        )
      ) as expected_date
    from target_obligations
    cross join lateral unnest(target_obligations.instance_months) as cycle(cycle_month)
  ),
  duplicate_instances as (
    select
      expected_dates.canonical_name,
      expected_dates.expected_date,
      count(*) as instance_count
    from expected_dates
    join public.obligation_instances instance
      on instance.obligation_id = expected_dates.obligation_id
     and instance.expected_date = expected_dates.expected_date
     and instance.status <> 'cancelled'
    group by expected_dates.canonical_name, expected_dates.expected_date
    having count(*) > 1
  )
  select *
  into duplicate_instance
  from duplicate_instances
  order by canonical_name, expected_date
  limit 1;

  if found then
    raise exception
      'Found % active instances for % on %. Resolve duplicates before relying on lifecycle output.',
      duplicate_instance.instance_count,
      duplicate_instance.canonical_name,
      duplicate_instance.expected_date;
  end if;
end $$;

commit;

-- Parity report.
with scope as (
  select *
  from (
    values
      (
        'Cuota Urbanización',
        '16c627ab-97c5-4d23-806a-6dc993f21ced'::uuid,
        80.00::numeric,
        1,
        14,
        'housing_home_maintenance',
        'Manuel',
        'monthly',
        array[date '2026-07-01', date '2026-08-01']
      ),
      (
        'Seguro Poliza Guagua - Soraya',
        null::uuid,
        1200.00::numeric,
        1,
        0,
        'insurance_auto',
        'Soraya',
        'annual',
        array[date '2026-08-01', date '2027-08-01']
      )
  ) as seed(
    canonical_name,
    legacy_scheduled_payment_id,
    expected_amount,
    expected_due_day,
    expected_grace_period_days,
    expected_category_code,
    expected_owner,
    expected_frequency,
    expected_dates
  )
),
actual_obligations as (
  select
    obligation.id,
    obligation.name,
    obligation.default_amount,
    obligation.due_day,
    obligation.grace_period_days,
    obligation.category_code,
    obligation.owner,
    obligation.frequency,
    obligation.is_active
  from public.obligations obligation
  where obligation.user_id = '376aeb27-8cbb-46c4-89b5-9da0a59e5364'
),
instance_counts as (
  select
    obligation.name,
    count(*) filter (
      where instance.expected_date = any(scope.expected_dates)
        and instance.status <> 'cancelled'
    ) as expected_instance_count
  from scope
  join actual_obligations obligation
    on lower(obligation.name) = lower(scope.canonical_name)
  left join public.obligation_instances instance
    on instance.obligation_id = obligation.id
  group by obligation.name
)
select
  scope.canonical_name,
  scope.legacy_scheduled_payment_id,
  actual_obligations.id as obligation_id,
  actual_obligations.default_amount as actual_amount,
  actual_obligations.due_day as actual_due_day,
  actual_obligations.grace_period_days as actual_grace_period_days,
  actual_obligations.category_code as actual_category_code,
  actual_obligations.owner as actual_owner,
  actual_obligations.frequency as actual_frequency,
  coalesce(instance_counts.expected_instance_count, 0) as expected_instance_count,
  case
    when actual_obligations.id is null then 'missing_obligation'
    when actual_obligations.default_amount <> scope.expected_amount then 'amount_mismatch'
    when actual_obligations.due_day <> scope.expected_due_day then 'due_day_mismatch'
    when actual_obligations.grace_period_days <> scope.expected_grace_period_days then 'grace_period_mismatch'
    when actual_obligations.category_code <> scope.expected_category_code then 'category_mismatch'
    when actual_obligations.owner <> scope.expected_owner then 'owner_mismatch'
    when actual_obligations.frequency <> scope.expected_frequency then 'frequency_mismatch'
    when actual_obligations.is_active is distinct from true then 'inactive_obligation'
    when coalesce(instance_counts.expected_instance_count, 0) <> 2 then 'instance_count_mismatch'
    else 'ok'
  end as parity_status
from scope
left join actual_obligations
  on lower(actual_obligations.name) = lower(scope.canonical_name)
left join instance_counts
  on lower(instance_counts.name) = lower(scope.canonical_name)
order by scope.canonical_name;
