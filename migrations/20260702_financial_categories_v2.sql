-- Financial Categories v2.
--
-- Adds canonical categories needed by obligations and household reporting.
-- Idempotent: inserts missing system categories and updates labels/kinds for
-- matching system codes when they already exist.

with seed(code, label, kind, sort_order) as (
  values
    ('housing', 'Housing', 'expense', 300),
    ('utilities', 'Utilities', 'expense', 1900),
    ('debt', 'Debt / Payment', 'payment', 1950),
    ('sports', 'Sports', 'expense', 1550),
    ('subscriptions', 'Subscriptions', 'expense', 900)
)
insert into public.transaction_categories (
  code,
  label,
  kind,
  is_system,
  sort_order
)
select
  seed.code,
  seed.label,
  seed.kind,
  true,
  seed.sort_order
from seed
where not exists (
  select 1
  from public.transaction_categories existing
  where existing.code = seed.code
    and existing.is_system = true
    and existing.user_id is null
);

with seed(code, label, kind, sort_order) as (
  values
    ('housing', 'Housing', 'expense', 300),
    ('utilities', 'Utilities', 'expense', 1900),
    ('debt', 'Debt / Payment', 'payment', 1950),
    ('sports', 'Sports', 'expense', 1550),
    ('subscriptions', 'Subscriptions', 'expense', 900)
)
update public.transaction_categories category
set
  label = seed.label,
  kind = seed.kind,
  sort_order = seed.sort_order,
  updated_at = now()
from seed
where category.code = seed.code
  and category.is_system = true
  and category.user_id is null;

with seed(parent_code, code, label, kind, sort_order) as (
  values
    ('housing', 'housing_home_maintenance', 'Home Maintenance', 'expense', 304),
    ('housing_home_maintenance', 'housing_yard_maintenance', 'Yard Maintenance', 'expense', 305),
    ('housing_home_maintenance', 'housing_pest_control', 'Pest Control', 'expense', 306),
    ('utilities', 'utilities_water', 'Utilities Water', 'expense', 1902),
    ('debt', 'debt_auto_loan', 'Auto Loan', 'payment', 1951),
    ('debt', 'debt_mortgage', 'Mortgage', 'payment', 1952)
),
parents as (
  select id, code
  from public.transaction_categories
  where is_system = true
    and user_id is null
)
insert into public.transaction_categories (
  code,
  label,
  parent_id,
  kind,
  is_system,
  sort_order
)
select
  seed.code,
  seed.label,
  parents.id,
  seed.kind,
  true,
  seed.sort_order
from seed
join parents on parents.code = seed.parent_code
where not exists (
  select 1
  from public.transaction_categories existing
  where existing.code = seed.code
    and existing.is_system = true
    and existing.user_id is null
);

with seed(parent_code, code, label, kind, sort_order) as (
  values
    ('housing', 'housing_home_maintenance', 'Home Maintenance', 'expense', 304),
    ('housing_home_maintenance', 'housing_yard_maintenance', 'Yard Maintenance', 'expense', 305),
    ('housing_home_maintenance', 'housing_pest_control', 'Pest Control', 'expense', 306),
    ('utilities', 'utilities_water', 'Utilities Water', 'expense', 1902),
    ('debt', 'debt_auto_loan', 'Auto Loan', 'payment', 1951),
    ('debt', 'debt_mortgage', 'Mortgage', 'payment', 1952)
),
parents as (
  select id, code
  from public.transaction_categories
  where is_system = true
    and user_id is null
)
update public.transaction_categories category
set
  label = seed.label,
  kind = seed.kind,
  sort_order = seed.sort_order,
  parent_id = parents.id,
  updated_at = now()
from seed
join parents on parents.code = seed.parent_code
where category.code = seed.code
  and category.is_system = true
  and category.user_id is null;
