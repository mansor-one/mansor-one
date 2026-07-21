-- Review Queue decision flow: atomic Plaid promotion and optional planning-fund spending.

alter table public.planning_items
  add column if not exists spent_amount numeric not null default 0;

alter table public.planning_item_transactions
  add column if not exists quick_entry_id uuid references public.quick_entries(id),
  add column if not exists plaid_import_id uuid references public.plaid_imports(id),
  add column if not exists canonical_category text,
  add column if not exists household_owner text;

alter table public.planning_item_transactions
  drop constraint if exists planning_item_transactions_transaction_type_check;

alter table public.planning_item_transactions
  add constraint planning_item_transactions_transaction_type_check
  check (transaction_type in (
    'assign', 'remove', 'transfer_in', 'transfer_out', 'adjustment', 'spend'
  ));

create unique index if not exists planning_item_transactions_quick_entry_unique
  on public.planning_item_transactions(quick_entry_id)
  where quick_entry_id is not null and transaction_type = 'spend';

create unique index if not exists planning_item_transactions_plaid_import_unique
  on public.planning_item_transactions(plaid_import_id)
  where plaid_import_id is not null and transaction_type = 'spend';

create index if not exists planning_item_transactions_planning_spend_idx
  on public.planning_item_transactions(planning_item_id, created_at desc)
  where transaction_type = 'spend';

create or replace function public.confirm_review_transaction(
  p_plaid_import_id uuid,
  p_transaction_type text,
  p_category text,
  p_planning_item_id uuid default null,
  p_owner text default null,
  p_note text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_import public.plaid_imports;
  v_quick_entry public.quick_entries;
  v_spending_link_id uuid;
  v_entry_type text;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if p_transaction_type not in (
    'regular_expense', 'goal_event', 'debt_payment', 'transfer',
    'non_spending', 'ignore'
  ) then
    raise exception 'Unsupported transaction type' using errcode = '22023';
  end if;

  select * into v_import
  from public.plaid_imports
  where id = p_plaid_import_id and user_id = v_user_id
  for update;

  if not found then
    raise exception 'Transaction not found' using errcode = 'P0002';
  end if;

  if v_import.pending or v_import.transaction_status <> 'active' then
    raise exception 'Transaction is pending or inactive' using errcode = '55000';
  end if;

  if p_transaction_type = 'ignore' then
    update public.plaid_imports
    set imported = true, transaction_status = 'rejected', updated_at = now()
    where id = v_import.id and user_id = v_user_id;

    return jsonb_build_object('ignored', true, 'quick_entry_id', null, 'planning_item_id', null);
  end if;

  if nullif(btrim(p_category), '') is null then
    raise exception 'Category is required' using errcode = '22023';
  end if;

  if p_transaction_type = 'goal_event' and p_planning_item_id is null then
    raise exception 'Planning fund is required' using errcode = '22023';
  end if;

  if p_planning_item_id is not null and not exists (
    select 1 from public.planning_items
    where id = p_planning_item_id
      and user_id = v_user_id
      and coalesce(is_archived, false) = false
      and coalesce(is_completed, false) = false
      and status not in ('archived', 'completed')
  ) then
    raise exception 'Planning fund not found' using errcode = 'P0002';
  end if;

  v_entry_type := case p_transaction_type
    when 'debt_payment' then 'payment'
    when 'transfer' then 'transfer'
    when 'non_spending' then 'non_spending'
    else 'expense'
  end;

  select * into v_quick_entry
  from public.quick_entries
  where user_id = v_user_id
    and plaid_transaction_id = v_import.plaid_transaction_id
  limit 1
  for update;

  if not found then
    insert into public.quick_entries (
      entry_date, entry_type, description, amount, owner, category,
      source, notes, account_name, plaid_transaction_id, user_id
    ) values (
      coalesce(v_import.transaction_date, current_date),
      v_entry_type,
      coalesce(v_import.merchant, v_import.plaid_category, 'Bank transaction'),
      coalesce(v_import.amount, 0),
      nullif(btrim(p_owner), ''),
      btrim(p_category),
      'plaid',
      nullif(btrim(p_note), ''),
      v_import.account_name,
      v_import.plaid_transaction_id,
      v_user_id
    ) returning * into v_quick_entry;
  else
    update public.quick_entries
    set entry_type = v_entry_type,
        category = btrim(p_category),
        owner = nullif(btrim(p_owner), ''),
        notes = nullif(btrim(p_note), '')
    where id = v_quick_entry.id and user_id = v_user_id
    returning * into v_quick_entry;
  end if;

  update public.plaid_imports
  set imported = true, updated_at = now()
  where id = v_import.id and user_id = v_user_id;

  if p_transaction_type = 'goal_event' then
    insert into public.planning_item_transactions (
      planning_item_id, transaction_type, amount, notes, user_id,
      quick_entry_id, plaid_import_id, canonical_category, household_owner
    ) values (
      p_planning_item_id, 'spend', abs(coalesce(v_import.amount, 0)),
      nullif(btrim(p_note), ''), v_user_id, v_quick_entry.id, v_import.id,
      btrim(p_category), nullif(btrim(p_owner), '')
    )
    on conflict (plaid_import_id) where plaid_import_id is not null and transaction_type = 'spend'
    do nothing
    returning id into v_spending_link_id;

    if v_spending_link_id is not null then
      update public.planning_items
      set spent_amount = spent_amount + abs(coalesce(v_import.amount, 0)),
          updated_at = now()
      where id = p_planning_item_id and user_id = v_user_id;
    end if;
  end if;

  return jsonb_build_object(
    'ignored', false,
    'quick_entry_id', v_quick_entry.id,
    'planning_item_id', p_planning_item_id
  );
end;
$$;

revoke all on function public.confirm_review_transaction(uuid, text, text, uuid, text, text)
  from public, anon;
grant execute on function public.confirm_review_transaction(uuid, text, text, uuid, text, text)
  to authenticated;
