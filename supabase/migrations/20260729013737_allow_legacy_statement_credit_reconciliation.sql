create or replace function public.configure_legacy_paid_obligation(
  p_scheduled_payment_id uuid,
  p_existing_obligation_id uuid,
  p_name text,
  p_owner text,
  p_category_code text,
  p_obligation_type text,
  p_frequency text,
  p_default_amount numeric,
  p_expected_date date,
  p_effective_due_date date,
  p_quick_entry_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public, private, pg_temp
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_household_id uuid;
  v_schedule public.scheduled_payments;
  v_obligation public.obligations;
  v_instance public.obligation_instances;
  v_quick_entry public.quick_entries;
  v_link public.obligation_payment_links;
  v_next_date date;
  v_next_instance_id uuid;
  v_frequency text := lower(btrim(coalesce(p_frequency, '')));
  v_name text := nullif(btrim(p_name), '');
  v_owner text := nullif(btrim(p_owner), '');
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  v_household_id := private.household_for_user(v_user_id);
  if v_household_id is null or not private.can_write_household(v_household_id) then
    raise exception 'Household write access required' using errcode = '42501';
  end if;

  if v_name is null or v_owner is null or p_default_amount is null or p_default_amount <= 0 then
    raise exception 'Name, owner and a positive amount are required' using errcode = '22023';
  end if;
  if p_expected_date is null or p_effective_due_date is null or p_effective_due_date < p_expected_date then
    raise exception 'Valid expected and effective due dates are required' using errcode = '22023';
  end if;
  if v_frequency not in ('monthly', 'quarterly', 'every_3_months', 'annual') then
    raise exception 'Unsupported recurring frequency' using errcode = '22023';
  end if;

  select * into v_schedule
  from public.scheduled_payments
  where id = p_scheduled_payment_id
    and household_id = v_household_id
  for update;

  if not found then
    raise exception 'Legacy schedule not found' using errcode = 'P0002';
  end if;

  if v_schedule.is_active is false and position('migrated_to_obligation.' in coalesce(v_schedule.notes, '')) = 0 then
    raise exception 'Legacy schedule is already inactive' using errcode = '55000';
  end if;

  select q.* into v_quick_entry
  from public.quick_entries q
  where q.id = p_quick_entry_id
    and q.household_id = v_household_id
    and (
      lower(coalesce(q.entry_type, '')) not in ('income', 'transfer')
      or (
        lower(coalesce(q.entry_type, '')) = 'income'
        and q.amount < 0
        and exists (
          select 1
          from public.plaid_imports source
          where source.household_id = v_household_id
            and source.plaid_transaction_id = q.plaid_transaction_id
            and source.pending is false
            and source.transaction_status = 'active'
            and source.amount < 0
            and lower(concat_ws(' ', source.account_type, source.account_subtype)) like '%credit%'
            and upper(concat_ws(
              ' ',
              source.merchant,
              source.suggested_category,
              source.plaid_category
            )) similar to '%(PAYYOURSELFBACK|PAY YOURSELF BACK|STATEMENT CREDIT|STATEMENT CR|REWARDS REDEMPTION|REWARD REDEMPTION|REDEMPTION CREDIT|REWARDS CREDIT|REWARD CREDIT|CASHBACK|CASH BACK|ACCOUNT CREDIT|CARD CREDIT|COURTESY CREDIT)%'
        )
      )
    )
  for update;

  if not found then
    raise exception 'Confirmed payment transaction not found' using errcode = 'P0002';
  end if;

  if exists (
    select 1
    from public.obligation_payment_links
    where quick_entry_id = v_quick_entry.id
      and household_id = v_household_id
  ) then
    raise exception 'This transaction is already linked to an obligation' using errcode = '23505';
  end if;

  if p_existing_obligation_id is not null then
    select * into v_obligation
    from public.obligations
    where id = p_existing_obligation_id
      and household_id = v_household_id
      and is_active is true
    for update;

    if not found then
      raise exception 'Canonical obligation not found' using errcode = 'P0002';
    end if;

    update public.obligations
    set default_amount = p_default_amount,
        amount = p_default_amount,
        amount_is_estimated = false,
        frequency = v_frequency,
        recurrence = v_frequency,
        due_date = p_expected_date,
        due_day = extract(day from p_expected_date)::integer,
        category_code = nullif(btrim(p_category_code), ''),
        obligation_type = coalesce(nullif(btrim(p_obligation_type), ''), obligation_type),
        owner = v_owner,
        updated_at = now()
    where id = v_obligation.id
    returning * into v_obligation;
  else
    insert into public.obligations (
      household_id, user_id, name, title, person, owner, category_code,
      obligation_type, default_amount, amount, amount_is_estimated,
      frequency, recurrence, due_date, due_day, grace_period_days,
      payment_method, is_active, active, notes
    ) values (
      v_household_id, v_user_id, v_name, v_name, v_owner, v_owner,
      nullif(btrim(p_category_code), ''),
      coalesce(nullif(btrim(p_obligation_type), ''), 'other'),
      p_default_amount, p_default_amount, false, v_frequency, v_frequency,
      p_expected_date, extract(day from p_expected_date)::integer, 0,
      null, true, true,
      format('Migrated from scheduled_payments.%s', v_schedule.id)
    )
    returning * into v_obligation;
  end if;

  insert into public.obligation_instances (
    household_id, user_id, obligation_id, expected_date,
    effective_due_date, amount_expected, amount_is_estimated,
    status, source, notes
  ) values (
    v_household_id, v_user_id, v_obligation.id, p_expected_date,
    p_effective_due_date, p_default_amount, false, 'closed', 'manual',
    format('Migrated from scheduled_payments.%s', v_schedule.id)
  )
  on conflict (obligation_id, expected_date) where status <> 'cancelled'
  do update set
    effective_due_date = excluded.effective_due_date,
    amount_expected = excluded.amount_expected,
    status = 'closed',
    updated_at = now()
  returning * into v_instance;

  insert into public.obligation_payment_links (
    household_id, user_id, obligation_instance_id, quick_entry_id,
    link_source, reconciliation_status, confidence, reported_amount,
    confirmed_at, reconciled_at, notes
  ) values (
    v_household_id, v_user_id, v_instance.id, v_quick_entry.id,
    'manual', 'reconciled', 100, abs(v_quick_entry.amount),
    (v_quick_entry.entry_date::text || 'T12:00:00Z')::timestamptz,
    now(), 'User selected an existing confirmed ledger transaction during legacy migration.'
  )
  returning * into v_link;

  insert into public.obligation_reconciliation_events (
    household_id, user_id, obligation_instance_id, payment_link_id,
    event_type, from_status, to_status, confidence, evidence
  ) values (
    v_household_id, v_user_id, v_instance.id, v_link.id,
    'manual_reconciled', 'pending', 'reconciled', 100,
    jsonb_build_object(
      'migration', 'legacy_scheduled_payment',
      'scheduled_payment_id', v_schedule.id,
      'quick_entry_id', v_quick_entry.id,
      'amount_matches', abs(abs(v_quick_entry.amount) - p_default_amount) < 0.01,
      'evidence_kind', case
        when lower(coalesce(v_quick_entry.entry_type, '')) = 'income'
          then 'statement_credit'
        else 'payment'
      end,
      'applied_amount', least(abs(v_quick_entry.amount), p_default_amount),
      'excess_unallocated', greatest(abs(v_quick_entry.amount) - p_default_amount, 0)
    )
  );

  v_next_date := case v_frequency
    when 'monthly' then (p_expected_date + interval '1 month')::date
    when 'quarterly' then (p_expected_date + interval '3 months')::date
    when 'every_3_months' then (p_expected_date + interval '3 months')::date
    when 'annual' then (p_expected_date + interval '1 year')::date
  end;

  insert into public.obligation_instances (
    household_id, user_id, obligation_id, expected_date,
    effective_due_date, amount_expected, amount_is_estimated,
    status, source, notes
  ) values (
    v_household_id, v_user_id, v_obligation.id, v_next_date,
    v_next_date, p_default_amount, false, 'pending', 'generated',
    'Generated after legacy payment reconciliation.'
  )
  on conflict (obligation_id, expected_date) where status <> 'cancelled'
  do nothing
  returning id into v_next_instance_id;

  update public.scheduled_payments
  set is_active = false,
      notes = concat_ws(
        E'\n', nullif(btrim(notes), ''),
        format('migrated_to_obligation.%s migrated_instance.%s', v_obligation.id, v_instance.id)
      )
  where id = v_schedule.id
    and household_id = v_household_id;

  return jsonb_build_object(
    'obligation_id', v_obligation.id,
    'obligation_instance_id', v_instance.id,
    'payment_link_id', v_link.id,
    'next_instance_id', v_next_instance_id,
    'legacy_schedule_archived', true
  );
end;
$$;

revoke all on function public.configure_legacy_paid_obligation(
  uuid, uuid, text, text, text, text, text, numeric, date, date, uuid
) from public, anon;
grant execute on function public.configure_legacy_paid_obligation(
  uuid, uuid, text, text, text, text, text, numeric, date, date, uuid
) to authenticated;

comment on function public.configure_legacy_paid_obligation(
  uuid, uuid, text, text, text, text, text, numeric, date, date, uuid
) is 'Atomically promotes one paid legacy schedule occurrence into the canonical obligation lifecycle using an existing confirmed quick entry.';


-- This replacement remains atomic because the PL/pgSQL function executes in
-- the caller's transaction. It does not rewrite existing rows.
--
-- Rollback: restore configure_legacy_paid_obligation from
-- 20260728221600_popular_visa_legacy_obligation_configuration.sql. Existing
-- statement-credit links must be reviewed before rollback because the older
-- predicate cannot create additional links of that kind.
