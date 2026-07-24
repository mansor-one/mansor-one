-- Project Phoenix Batch 3: family recurring obligations.
--
-- Executable when Manuel approves Batch 3 execution. Do not run before then.
--
-- Scope:
-- - Migrate now: Colegio Gaby, Tutorias Gaby.
-- - Defer: Unas Gaby, Unas Soraya, Seguro Casa, Plan Dental Soraya,
--   Fumigador/Fumigacion.
-- - Do not delete, archive, or update legacy scheduled_payments rows.
--
-- This script writes public.obligations and public.obligation_instances only.
-- It intentionally keeps the legacy scheduled_payments rows intact while
-- adding Project Phoenix source metadata to obligation notes so the Financial
-- Engine lifecycle bridge can suppress duplicate scheduled_payments pressure.
--
-- Live compatibility:
-- The live obligations table still has legacy columns such as person, title,
-- amount, due_date, recurrence, priority and active. This script writes both
-- the new ADR fields and the legacy fields so NOT NULL legacy constraints are
-- satisfied during the transition.

begin;

drop table if exists pg_temp.phoenix_batch_3_scope;
drop table if exists pg_temp.phoenix_batch_3_seed;

create temp table phoenix_batch_3_scope (
  legacy_scheduled_payment_id uuid primary key,
  expected_legacy_name text not null,
  canonical_name text not null,
  name_match text[] not null,
  category_code text not null,
  owner text not null,
  obligation_type text not null,
  frequency text not null,
  payment_method text,
  amount_is_estimated boolean not null,
  active_month_numbers integer[] not null,
  active_months_note text not null,
  description text not null,
  notes_prefix text not null
) on commit preserve rows;

insert into phoenix_batch_3_scope (
  legacy_scheduled_payment_id,
  expected_legacy_name,
  canonical_name,
  name_match,
  category_code,
  owner,
  obligation_type,
  frequency,
  payment_method,
  amount_is_estimated,
  active_month_numbers,
  active_months_note,
  description,
  notes_prefix
)
values
  (
    'deb493fa-8dec-40d9-8a18-29495edf87dc',
    'Colegio Gaby',
    'Colegio Gaby',
    array['colegio gaby', 'colegio', 'school gaby'],
    'education_school',
    'household',
    'service',
    'monthly',
    null,
    false,
    array[1, 2, 3, 4, 5, 8, 9, 10, 11, 12],
    'Active school months exclude June and July; August is active.',
    'Gaby school recurring payment.',
    'Project Phoenix Batch 3. Migrated from scheduled_payments.deb493fa-8dec-40d9-8a18-29495edf87dc Colegio Gaby. Active months exclude summer except August.'
  ),
  (
    '6da31c21-9632-4c34-b98f-7d66f18fee61',
    'Tutorias Gaby',
    'Tutorias Gaby',
    array['tutorias gaby', 'tutorías gaby', 'tutorias', 'tutorías', 'tutoria gaby', 'tutoría gaby'],
    'education_tutoring',
    'household',
    'service',
    'monthly',
    null,
    false,
    array[1, 2, 3, 4, 8, 9, 10, 11, 12],
    'Active tutoring months are January through April and August through December.',
    'Gaby tutoring recurring payment.',
    'Project Phoenix Batch 3. Migrated from scheduled_payments.6da31c21-9632-4c34-b98f-7d66f18fee61 Tutorias Gaby. Active months Jan-Apr and Aug-Dec.'
  );

do $$
declare
  mansor_user_id constant uuid := '376aeb27-8cbb-46c4-89b5-9da0a59e5364';
  missing_count integer;
  changed_row record;
  alias_conflict record;
  missing_due_day record;
  invalid_month record;
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
  from phoenix_batch_3_scope scope
  left join public.scheduled_payments legacy
    on legacy.id = scope.legacy_scheduled_payment_id
  where legacy.id is null;

  if missing_count > 0 then
    raise exception 'Project Phoenix Batch 3 expected % scheduled_payments rows that were not found.', missing_count;
  end if;

  select
    scope.expected_legacy_name,
    scope.name_match,
    legacy.name as actual_legacy_name,
    scope.legacy_scheduled_payment_id
  into changed_row
  from phoenix_batch_3_scope scope
  join public.scheduled_payments legacy
    on legacy.id = scope.legacy_scheduled_payment_id
  where lower(legacy.name) <> all(scope.name_match)
  order by scope.expected_legacy_name
  limit 1;

  if found then
    raise exception
      'Project Phoenix Batch 3 expected scheduled_payments.% to be named one of %, but found %.',
      changed_row.legacy_scheduled_payment_id,
      changed_row.name_match,
      changed_row.actual_legacy_name;
  end if;

  select
    lower(alias_value) as duplicated_alias,
    array_agg(distinct canonical_name order by canonical_name) as canonical_names
  into alias_conflict
  from phoenix_batch_3_scope
  cross join unnest(name_match || array[lower(canonical_name)]) as alias_value
  group by lower(alias_value)
  having count(distinct canonical_name) > 1
  order by lower(alias_value)
  limit 1;

  if found then
    raise exception
      'Project Phoenix Batch 3 alias % maps to multiple canonical obligations: %. Fix aliases before running.',
      alias_conflict.duplicated_alias,
      alias_conflict.canonical_names;
  end if;

  select
    scope.canonical_name,
    scope.legacy_scheduled_payment_id
  into missing_due_day
  from phoenix_batch_3_scope scope
  join public.scheduled_payments legacy
    on legacy.id = scope.legacy_scheduled_payment_id
  where legacy.due_day is null
  order by scope.canonical_name
  limit 1;

  if found then
    raise exception
      'Project Phoenix Batch 3 cannot migrate % from scheduled_payments.% because due_day is null. Confirm due day or defer it.',
      missing_due_day.canonical_name,
      missing_due_day.legacy_scheduled_payment_id;
  end if;

  select
    scope.canonical_name,
    bad_month.month_number
  into invalid_month
  from phoenix_batch_3_scope scope
  cross join unnest(scope.active_month_numbers) as bad_month(month_number)
  where bad_month.month_number < 1
     or bad_month.month_number > 12
  order by scope.canonical_name, bad_month.month_number
  limit 1;

  if found then
    raise exception
      'Project Phoenix Batch 3 has invalid active month % for %. Fix active_month_numbers before running.',
      invalid_month.month_number,
      invalid_month.canonical_name;
  end if;
end $$;

create temp table phoenix_batch_3_seed as
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
  from phoenix_batch_3_scope scope
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
  legacy_rows.amount_is_estimated,
  legacy_rows.active_month_numbers,
  legacy_rows.active_months_note,
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
  make_date(
    2026,
    8,
    least(legacy_rows.legacy_due_day, extract(day from date '2026-08-31')::integer)
  ) as legacy_due_date,
  legacy_rows.frequency as legacy_recurrence,
  2::integer as legacy_priority,
  true as legacy_active,
  concat_ws(
    ' ',
    legacy_rows.notes_prefix,
    legacy_rows.active_months_note,
    case
      when legacy_rows.legacy_notes is not null
        then concat('Legacy notes:', legacy_rows.legacy_notes)
      else null
    end,
    concat('Legacy active_months:', coalesce(legacy_rows.legacy_active_months, 'all')),
    concat(
      'Legacy source:',
      'scheduled_payments.',
      legacy_rows.legacy_scheduled_payment_id
    )
  ) as notes
from target_user
cross join legacy_rows;

do $$
declare
  duplicate_match record;
begin
  with existing_matches as (
    select
      seed.canonical_name,
      count(*) as matching_obligations
    from phoenix_batch_3_seed seed
    join public.obligations obligation
      on obligation.user_id = seed.user_id
     and lower(obligation.name) = any(seed.name_match || array[lower(seed.canonical_name)])
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
      'Project Phoenix Batch 3 found % pre-existing obligations matching %. Resolve duplicates manually before running.',
      duplicate_match.matching_obligations,
      duplicate_match.canonical_name;
  end if;
end $$;

do $$
declare
  duplicate_alias_match record;
begin
  with alias_hits as (
    select
      seed.canonical_name,
      obligation.id,
      obligation.name
    from phoenix_batch_3_seed seed
    join public.obligations obligation
      on obligation.user_id = seed.user_id
     and lower(obligation.name) = any(seed.name_match || array[lower(seed.canonical_name)])
  )
  select
    canonical_name,
    count(*) as matching_obligations,
    array_agg(name order by name) as matching_names
  into duplicate_alias_match
  from alias_hits
  group by canonical_name
  having count(*) > 1
  order by canonical_name
  limit 1;

  if found then
    raise exception
      'Project Phoenix Batch 3 found ambiguous existing obligations for %: %. Resolve duplicate aliases before running.',
      duplicate_alias_match.canonical_name,
      duplicate_alias_match.matching_names;
  end if;
end $$;

with matched_existing as (
  select distinct on (seed.canonical_name)
    seed.canonical_name,
    obligation.id as obligation_id
  from phoenix_batch_3_seed seed
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
  from phoenix_batch_3_seed seed
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
from phoenix_batch_3_seed seed
where not exists (
  select 1
  from matched_existing existing
  where existing.canonical_name = seed.canonical_name
);

with target_obligations as (
  select
    seed.*,
    obligation.id as obligation_id
  from phoenix_batch_3_seed seed
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
      'Project Phoenix Batch 3 generated July/August 2026 family recurring cycle only when the cycle is an active school month. Source scheduled_payments.',
      target_obligations.legacy_scheduled_payment_id,
      '. Legacy source: scheduled_payments.',
      target_obligations.legacy_scheduled_payment_id,
      '. ',
      target_obligations.active_months_note
    ) as notes
  from target_obligations
  cross join (
    values
      (date '2026-07-01'),
      (date '2026-08-01')
  ) as cycle(cycle_month)
  where target_obligations.due_day is not null
    and extract(month from cycle.cycle_month)::integer = any(target_obligations.active_month_numbers)
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
    and instance.status = 'pending'
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
  with expected_instance_dates as (
    select
      seed.user_id,
      obligation.id as obligation_id,
      obligation.name,
      make_date(
        2026,
        expected_month.month_number,
        least(
          seed.due_day,
          extract(day from (
            date_trunc('month', make_date(2026, expected_month.month_number, 1))::date
            + interval '1 month - 1 day'
          ))::integer
        )
      ) as expected_date
    from phoenix_batch_3_seed seed
    join public.obligations obligation
      on obligation.user_id = seed.user_id
     and lower(obligation.name) = lower(seed.canonical_name)
    cross join unnest(array[7, 8]) as expected_month(month_number)
    where expected_month.month_number = any(seed.active_month_numbers)
  ),
  duplicate_instances as (
    select
      expected_instance_dates.name,
      instance.expected_date,
      count(*) as instance_count
    from expected_instance_dates
    join public.obligation_instances instance
      on instance.user_id = expected_instance_dates.user_id
     and instance.obligation_id = expected_instance_dates.obligation_id
     and instance.status <> 'cancelled'
     and instance.expected_date = expected_instance_dates.expected_date
    group by expected_instance_dates.name, instance.expected_date
    having count(*) > 1
  )
  select *
  into duplicate_instance
  from duplicate_instances
  order by name, expected_date
  limit 1;

  if found then
    raise exception
      'Project Phoenix Batch 3 found % active instances for % on %. Resolve duplicates before relying on lifecycle output.',
      duplicate_instance.instance_count,
      duplicate_instance.name,
      duplicate_instance.expected_date;
  end if;
end $$;

commit;

-- Parity report.
-- Run after the transaction to verify Batch 3 without changing legacy rows.
with scope as (
  select *
  from (
    values
      (
        'deb493fa-8dec-40d9-8a18-29495edf87dc'::uuid,
        'Colegio Gaby',
        'Colegio Gaby',
        array['colegio gaby', 'colegio', 'school gaby'],
        'education_school',
        'household',
        array[1, 2, 3, 4, 5, 8, 9, 10, 11, 12],
        true
      ),
      (
        '6da31c21-9632-4c34-b98f-7d66f18fee61'::uuid,
        'Tutorias Gaby',
        'Tutorias Gaby',
        array['tutorias gaby', 'tutorías gaby', 'tutorias', 'tutorías', 'tutoria gaby', 'tutoría gaby'],
        'education_tutoring',
        'household',
        array[1, 2, 3, 4, 8, 9, 10, 11, 12],
        true
      )
  ) as row(
    legacy_scheduled_payment_id,
    expected_legacy_name,
    canonical_name,
    allowed_legacy_names,
    expected_category_code,
    expected_owner,
    active_month_numbers,
    migrate_now
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
      'colegio gaby',
      'tutorias gaby'
    )
),
expected_months as (
  select *
  from (
    values
      (7),
      (8)
  ) as row(month_number)
),
expected_instance_counts as (
  select
    legacy_rows.canonical_name,
    count(*) filter (
      where legacy_rows.legacy_due_day is not null
        and expected_months.month_number = any(legacy_rows.active_month_numbers)
    ) as expected_july_august_instance_count
  from legacy_rows
  cross join expected_months
  group by legacy_rows.canonical_name
),
instance_counts as (
  select
    obligation.name,
    count(*) filter (where instance.status <> 'cancelled') as active_instance_count,
    count(*) filter (
      where instance.status <> 'cancelled'
        and instance.expected_date >= date '2026-07-01'
        and instance.expected_date < date '2026-09-01'
    ) as july_august_instance_count,
    count(*) filter (
      where instance.status <> 'cancelled'
        and instance.expected_date >= date '2026-07-01'
        and instance.expected_date < date '2026-08-01'
    ) as july_instance_count,
    count(*) filter (
      where instance.status <> 'cancelled'
        and instance.expected_date >= date '2026-08-01'
        and instance.expected_date < date '2026-09-01'
    ) as august_instance_count
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
  actual_obligations.id as obligation_id,
  actual_obligations.default_amount as obligation_amount,
  actual_obligations.due_day as obligation_due_day,
  actual_obligations.grace_period_days,
  actual_obligations.category_code,
  actual_obligations.owner,
  coalesce(expected_instance_counts.expected_july_august_instance_count, 0)
    as expected_july_august_instance_count,
  coalesce(instance_counts.july_instance_count, 0) as july_instance_count,
  coalesce(instance_counts.august_instance_count, 0) as august_instance_count,
  coalesce(instance_counts.july_august_instance_count, 0) as actual_july_august_instance_count,
  case
    when legacy_rows.legacy_id is null then 'missing_legacy_row'
    when lower(legacy_rows.legacy_name) <> all(legacy_rows.allowed_legacy_names) then 'legacy_name_mismatch'
    when legacy_rows.legacy_due_day is null then 'missing_due_day'
    when actual_obligations.id is null then 'missing_obligation'
    when actual_obligations.default_amount <> legacy_rows.legacy_amount then 'amount_mismatch'
    when actual_obligations.owner <> legacy_rows.expected_owner then 'owner_mismatch'
    when actual_obligations.category_code <> legacy_rows.expected_category_code then 'category_mismatch'
    when actual_obligations.due_day is distinct from legacy_rows.legacy_due_day then 'due_day_mismatch'
    when coalesce(instance_counts.july_instance_count, 0) <> 0 then 'unexpected_july_instance'
    when coalesce(instance_counts.july_august_instance_count, 0)
      <> coalesce(expected_instance_counts.expected_july_august_instance_count, 0) then 'instance_count_mismatch'
    else 'ok'
  end as parity_status
from legacy_rows
left join actual_obligations
  on lower(actual_obligations.name) = lower(legacy_rows.canonical_name)
left join expected_instance_counts
  on lower(expected_instance_counts.canonical_name) = lower(legacy_rows.canonical_name)
left join instance_counts
  on lower(instance_counts.name) = lower(legacy_rows.canonical_name)
order by legacy_rows.canonical_name;
