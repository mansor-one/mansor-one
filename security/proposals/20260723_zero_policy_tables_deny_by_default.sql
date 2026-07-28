-- PROPOSAL ONLY. DO NOT PLACE UNDER supabase/migrations OR APPLY WITHOUT APPROVAL.
-- Purpose: make the existing deny-by-default intent explicit without adding
-- household columns, backfills, client data access, or new product behavior.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '2min';

do $$
declare
  target_table text;
  existing_policy record;
  blocked_tables constant text[] := array[
    'account_snapshots',
    'ath_movil_matches',
    'ath_movil_rules',
    'categories',
    'events',
    'fixed_expenses',
    'monthly_documents',
    'pablo_questions',
    'plaid_category_rules',
    'plaid_items',
    'raw_transactions',
    'recommendations',
    'reminders',
    'statement_imports',
    'transactions',
    'variable_income'
  ];
begin
  foreach target_table in array blocked_tables loop
    execute format('alter table public.%I enable row level security', target_table);
    execute format('revoke all privileges on table public.%I from anon, authenticated', target_table);

    for existing_policy in
      select policyname
      from pg_policies
      where schemaname = 'public' and tablename = target_table
    loop
      execute format(
        'drop policy %I on public.%I',
        existing_policy.policyname,
        target_table
      );
    end loop;

    -- An explicit false policy documents intentional blocking and clears the
    -- ambiguous "RLS enabled with no policy" state without granting access.
    execute format(
      'create policy %1$I on public.%2$I for all to authenticated using (false) with check (false)',
      left(target_table || '_intentionally_blocked', 63),
      target_table
    );
  end loop;
end
$$;

-- ath_movil_rules is the only listed table currently read by application code,
-- and only through a service-role server route.
grant select on table public.ath_movil_rules to service_role;

do $$
declare
  client_data_grants integer;
  non_deny_policy_count integer;
begin
  select count(*) into client_data_grants
  from information_schema.role_table_grants
  where table_schema = 'public'
    and table_name = any(array[
      'account_snapshots', 'ath_movil_matches', 'ath_movil_rules',
      'categories', 'events', 'fixed_expenses', 'monthly_documents',
      'pablo_questions', 'plaid_category_rules', 'plaid_items',
      'raw_transactions', 'recommendations', 'reminders',
      'statement_imports', 'transactions', 'variable_income'
    ])
    and grantee in ('anon', 'authenticated')
    and privilege_type in (
      'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'
    );

  if client_data_grants <> 0 then
    raise exception 'Blocked-table gate found % client grants', client_data_grants;
  end if;

  select count(*) into non_deny_policy_count
  from pg_policies
  where schemaname = 'public'
    and tablename = any(array[
      'account_snapshots', 'ath_movil_matches', 'ath_movil_rules',
      'categories', 'events', 'fixed_expenses', 'monthly_documents',
      'pablo_questions', 'plaid_category_rules', 'plaid_items',
      'raw_transactions', 'recommendations', 'reminders',
      'statement_imports', 'transactions', 'variable_income'
    ])
    and (
      roles <> array['authenticated'::name]
      or cmd <> 'ALL'
      or trim(coalesce(qual, '')) <> 'false'
      or trim(coalesce(with_check, '')) <> 'false'
    );

  if non_deny_policy_count <> 0 then
    raise exception 'Blocked-table gate found % unexpected policies', non_deny_policy_count;
  end if;
end
$$;

commit;
