-- Controlled Obligations Seed v1.
--
-- Review before running. This script is intentionally stored outside
-- migrations so it is not applied automatically with schema migrations.
--
-- User:
--   376aeb27-8cbb-46c4-89b5-9da0a59e5364
--
-- Idempotency:
-- - Obligations are inserted only when the same user/name does not exist.
-- - Providers are inserted only when the same user/obligation/provider/active_from
--   combination does not exist.
--
-- Notes:
-- - This script does not create obligation_instances yet.
-- - Home service category_code values use the Financial Categories v2
--   canonical obligation categories.

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
end $$;

with target_user as (
  select '376aeb27-8cbb-46c4-89b5-9da0a59e5364'::uuid as user_id
),
obligation_seed as (
  select
    target_user.user_id,
    seed.name,
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
    seed.notes
  from target_user
  cross join (
    values
      (
        'Recorte de grama',
        'Monthly lawn service.',
        'housing_yard_maintenance',
        'household',
        'service',
        30::numeric,
        false,
        'monthly',
        null::integer,
        0,
        'ATH Movil',
        'Current provider: Figueroa Guardia. Phone: 787-906-2129. Intended category: Yard Maintenance or Home Maintenance.'
      ),
      (
        'Fumigacion',
        'Pest control service.',
        'housing_pest_control',
        'household',
        'service',
        20::numeric,
        true,
        'every_3_months',
        null::integer,
        0,
        null::text,
        'Current provider: Felix. Phone: 787-312-8690. Last service: March 2026. Intended category: Home Maintenance / Pest Control.'
      ),
      (
        'Toyota',
        'Monthly Toyota auto loan placeholder.',
        'debt_auto_loan',
        'household',
        'loan',
        null::numeric,
        true,
        'monthly',
        18,
        15,
        null::text,
        'Placeholder only. Amount, provider, account and payment method TBD.'
      ),
      (
        'Honda',
        'Monthly Honda auto loan placeholder.',
        'debt_auto_loan',
        'household',
        'loan',
        null::numeric,
        true,
        'monthly',
        null::integer,
        0,
        null::text,
        'Placeholder only. Due day, grace period, amount, provider, account and payment method TBD.'
      ),
      (
        'Agua / AAA',
        'Monthly water utility placeholder estimated from prior cycle.',
        'utilities_water',
        'household',
        'utility',
        null::numeric,
        true,
        'monthly',
        null::integer,
        0,
        null::text,
        'Placeholder only. Amount, due day, account and payment method TBD.'
      )
  ) as seed(
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
    notes
  )
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
  notes
)
select
  seed.user_id,
  seed.name,
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
  seed.notes
from obligation_seed seed
where not exists (
  select 1
  from public.obligations existing
  where existing.user_id = seed.user_id
    and existing.name = seed.name
);

with target_user as (
  select '376aeb27-8cbb-46c4-89b5-9da0a59e5364'::uuid as user_id
),
provider_seed as (
  select
    target_user.user_id,
    seed.obligation_name,
    seed.provider_name,
    seed.phone,
    seed.payment_method,
    seed.active_from,
    seed.notes
  from target_user
  cross join (
    values
      (
        'Recorte de grama',
        'Figueroa Guardia',
        '787-906-2129',
        'ATH Movil',
        null::date,
        'Initial known lawn service provider.'
      ),
      (
        'Fumigacion',
        'Felix',
        '787-312-8690',
        null::text,
        '2026-03-01'::date,
        'Initial known pest control provider; last service March 2026.'
      )
  ) as seed(
    obligation_name,
    provider_name,
    phone,
    payment_method,
    active_from,
    notes
  )
)
insert into public.obligation_providers (
  user_id,
  obligation_id,
  provider_name,
  phone,
  payment_method,
  active_from,
  notes
)
select
  seed.user_id,
  obligation.id,
  seed.provider_name,
  seed.phone,
  seed.payment_method,
  seed.active_from,
  seed.notes
from provider_seed seed
join public.obligations obligation
  on obligation.user_id = seed.user_id
 and obligation.name = seed.obligation_name
where not exists (
  select 1
  from public.obligation_providers existing
  where existing.user_id = seed.user_id
    and existing.obligation_id = obligation.id
    and existing.provider_name = seed.provider_name
    and coalesce(existing.active_from, date '1900-01-01') =
      coalesce(seed.active_from, date '1900-01-01')
);

commit;
