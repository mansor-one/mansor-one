-- Project Phoenix proposed migration draft.
--
-- WARNING:
--   Proposal only. Do not run against production as-is.
--   The first statement intentionally aborts execution.
--
-- Intended flow after human review:
--   1. Remove the abort guard only in a reviewed branch or throwaway DB.
--   2. Run 01_legacy_row_mapping_report.sql and compare counts.
--   3. Apply one batch at a time.
--   4. Re-run Financial Engine parity checks after each batch.

do $$
begin
  raise exception 'Project Phoenix proposal only: review and remove this guard before any migration run.';
end $$;

begin;

-- Replace with the household user after verification.
-- The current live data observed during audit used:
--   376aeb27-8cbb-46c4-89b5-9da0a59e5364
create temp table phoenix_context (
  user_id uuid primary key
) on commit drop;

insert into phoenix_context (user_id)
values ('376aeb27-8cbb-46c4-89b5-9da0a59e5364');

create temp table phoenix_legacy_obligation_map (
  batch_name text not null,
  canonical_name text not null,
  legacy_table text not null,
  legacy_id uuid not null,
  target_domain text not null,
  migration_action text not null,
  confidence text not null,
  notes text
) on commit drop;

-- Batch 1: vehicles/loans.
insert into phoenix_legacy_obligation_map values
  (
    'batch_1_vehicles_loans',
    'Honda Soraya',
    'liabilities',
    '6d5f3910-f2cb-4043-8fae-4f71329bfc97',
    'obligations',
    'create canonical Honda auto-loan obligation; retain liability payoff metadata',
    'high',
    'Duplicate with scheduled_payments Guagua Soraya.'
  ),
  (
    'batch_1_vehicles_loans',
    'Honda Soraya',
    'scheduled_payments',
    'b942563d-261f-401a-abc5-6d5fabbf8f23',
    'obligations',
    'merge into canonical Honda auto-loan obligation',
    'medium',
    'Legacy display name is Guagua Soraya; amount matches liability monthly payment.'
  ),
  (
    'batch_1_vehicles_loans',
    'Toyota Corolla Cross',
    'liabilities',
    '0ada3acb-29d2-4958-88a6-283624c7d8e9',
    'obligations',
    'create Toyota auto-loan obligation from liability',
    'high',
    'No scheduled_payments duplicate found.'
  ),
  (
    'batch_1_vehicles_loans',
    'Hipoteca Casa Cayey',
    'liabilities',
    '634c9d6f-fd5a-433a-ac4e-797fae06233d',
    'obligations',
    'merge with scheduled_payments Hipoteca',
    'high',
    'Keep mortgage payoff metadata in liabilities.'
  ),
  (
    'batch_1_vehicles_loans',
    'Hipoteca Casa Cayey',
    'scheduled_payments',
    '57044a71-1f26-4a29-954d-573dfb0d2ce2',
    'obligations',
    'merge into canonical mortgage obligation',
    'high',
    'Legacy due day represents effective/grace date, not original mortgage due day.'
  );

-- Batch 2: utilities/services.
insert into phoenix_legacy_obligation_map values
  ('batch_2_utilities_services', 'Agua / AAA', 'scheduled_payments', 'ef7ee92b-2b22-4f60-8b82-3acaec42930c', 'obligations', 'create utility obligation', 'high', 'Water utility, monthly due day 22.'),
  ('batch_2_utilities_services', 'Luz / LUMA', 'scheduled_payments', '81071b2b-5f16-41ca-8838-3a359dc595ad', 'obligations', 'create utility obligation', 'high', 'Electric utility, monthly due day 25.'),
  ('batch_2_utilities_services', 'Internet', 'scheduled_payments', '406f0a86-34da-4c31-b174-93388ea8dc2e', 'obligations', 'create utility/service obligation', 'high', 'Provider not confirmed in row; possible Liberty/internet.'),
  ('batch_2_utilities_services', 'SunRun', 'scheduled_payments', '9ae616f7-6746-4214-810a-eb16c5959425', 'obligations', 'create service/utility obligation', 'high', 'Promise-of-payment history exists.'),
  ('batch_2_utilities_services', 'Grama', 'scheduled_payments', '8b7a4374-c882-433b-ac15-5a6818ae1bcb', 'obligations', 'create service obligation and provider when verified', 'high', 'Provider can change; preserve history through providers/links.'),
  ('batch_2_utilities_services', 'Celulares', 'scheduled_payments', '6653e7dd-30a4-4e8b-b863-efae0f9da49d', 'obligations', 'create utility/service obligation', 'high', 'Due day missing; requires user confirmation before generated instances.'),
  ('batch_2_utilities_services', 'Barbero', 'scheduled_payments', '187b90d1-c545-4b5e-ac42-0857784578cc', 'obligations', 'create service obligation or keep manual recurring reminder', 'medium', 'Due date follows payday; generated cycle needs custom frequency.');

-- Batch 3: education/family recurring.
insert into phoenix_legacy_obligation_map values
  ('batch_3_education_family', 'Colegio Gaby', 'scheduled_payments', 'deb493fa-8dec-40d9-8a18-29495edf87dc', 'obligations', 'create education obligation with active month schedule', 'high', 'Active months exclude summer except August.'),
  ('batch_3_education_family', 'Tutorias Gaby', 'scheduled_payments', '6da31c21-9632-4c34-b98f-7d66f18fee61', 'obligations', 'create education obligation with active month schedule', 'high', 'Active months Jan-Apr and Aug-Dec.'),
  ('batch_3_education_family', 'Unas Gaby', 'scheduled_payments', '209ed644-49b3-4e85-832e-064962221ed4', 'obligations', 'create personal recurring obligation with custom/every-3-weeks note', 'medium', 'Current target schema cannot represent every 3 weeks exactly.'),
  ('batch_3_education_family', 'Unas Soraya', 'scheduled_payments', '47a4b3bb-8215-46c3-a308-840f77f4fe6f', 'obligations', 'create personal recurring obligation with custom/every-3-weeks note', 'medium', 'Current target schema cannot represent every 3 weeks exactly.'),
  ('batch_3_education_family', 'Seguro Casa', 'scheduled_payments', '16c627ab-97c5-4d23-806a-6dc993f21ced', 'obligations', 'create insurance obligation', 'high', 'Also exists as planning priority; do not duplicate planning item.');

-- Batch 4: cards if needed.
insert into phoenix_legacy_obligation_map values
  ('batch_4_cards_if_needed', 'Popular Visa', 'scheduled_payments', '7ea5a798-44ad-4b7c-9530-b3b21341051e', 'cards/obligations', 'defer to Cards domain; bridge only if lifecycle needs it', 'medium', 'Card payments are already handled by Cards.'),
  ('batch_4_cards_if_needed', 'US Bank', 'scheduled_payments', '48166355-bd5b-498a-96b1-dd56903da144', 'cards/obligations', 'defer to Cards domain; bridge only if lifecycle needs it', 'medium', 'Card payments are already handled by Cards.'),
  ('batch_4_cards_if_needed', 'Synchrony', 'scheduled_payments', 'eb2f86cb-4eb8-4133-89d8-a3d8b4b71c43', 'cards/obligations', 'defer to Cards domain; bridge only if lifecycle needs it', 'medium', 'Card payments are already handled by Cards and has confirmed June instance.'),
  ('batch_4_cards_if_needed', 'Chase', 'scheduled_payments', 'e2c7ffca-22b0-4f67-85c9-7e89eb78e47b', 'cards/obligations', 'defer to Cards domain; validate zero amount before any migration', 'low', 'Amount is zero; created from card validation.');

-- Batch 5: planning/future items.
-- These stay in planning_items. Do not insert recurring obligations from
-- future_obligations unless the user explicitly confirms recurrence.
create temp table phoenix_planning_keep_map (
  legacy_table text not null,
  legacy_id uuid not null,
  name text not null,
  target_action text not null
) on commit drop;

insert into phoenix_planning_keep_map values
  ('future_obligations', '5c2a8680-1c98-48da-9d81-4e713fe04f18', 'Marbete Soraya', 'already represented in planning_items; keep as planning/history'),
  ('future_obligations', 'acaa3938-94ef-45a7-94e4-fdcefd145fa6', 'Planilla Vec Solution - Soraya', 'already represented in planning_items; keep as annual planning item'),
  ('future_obligations', '01db7f3a-3df2-44f7-b1b8-dcfd42463bad', 'Libros Gaby', 'already represented in planning_items'),
  ('future_obligations', '975e298a-f39b-415c-8430-64390d24cbe1', 'Seguro Poliza Guagua - Soraya', 'already represented in planning_items; do not create monthly recurring obligation'),
  ('future_obligations', '19d3567e-46d7-49c3-a736-c222a30cc563', 'Cuarto Andrea', 'already represented in planning_items'),
  ('future_obligations', 'f9124648-1ecd-4159-8df5-ae7e9c0f05c1', 'Cuarto Gaby', 'already represented in planning_items'),
  ('future_obligations', '294e3a22-962a-44d3-a2ba-8eebf44d01b7', 'AutoExpreso', 'already represented in planning_items; reserve item, not recurring obligation'),
  ('future_obligations', '6f5dc0bb-ed36-4da3-beb4-b0135cee0b10', 'Navidad', 'already represented in planning_items');

-- Proposed insert shape for Batch 1 after approval.
-- Keep this as a template until generated ids, category codes, and due dates
-- are reviewed.
/*
with context as (
  select user_id from phoenix_context
),
vehicle_seed as (
  select * from (
    values
      ('Honda Soraya', 'debt_auto_loan', 'Soraya', 'loan', 947.78::numeric, false, 'monthly', 4::integer, 17::integer, 'Merged from liabilities Honda Soraya and scheduled_payments Guagua Soraya.'),
      ('Toyota Corolla Cross', 'debt_auto_loan', 'Manuel', 'loan', 778.79::numeric, false, 'monthly', 18::integer, 3::integer, 'Created from liabilities. Grace through about day 21.'),
      ('Hipoteca Casa Cayey', 'debt_mortgage', 'Manuel', 'loan', 752.07::numeric, false, 'monthly', 1::integer, 14::integer, 'Merged from liabilities and scheduled_payments Hipoteca.')
  ) as seed(name, category_code, owner, obligation_type, default_amount, amount_is_estimated, frequency, due_day, grace_period_days, notes)
)
insert into public.obligations (
  user_id,
  name,
  category_code,
  owner,
  obligation_type,
  default_amount,
  amount_is_estimated,
  frequency,
  due_day,
  grace_period_days,
  is_active,
  notes
)
select
  context.user_id,
  seed.name,
  seed.category_code,
  seed.owner,
  seed.obligation_type,
  seed.default_amount,
  seed.amount_is_estimated,
  seed.frequency,
  seed.due_day,
  seed.grace_period_days,
  true,
  seed.notes
from context
cross join vehicle_seed seed
where not exists (
  select 1
  from public.obligations existing
  where existing.user_id = context.user_id
    and lower(existing.name) = lower(seed.name)
);
*/

rollback;
