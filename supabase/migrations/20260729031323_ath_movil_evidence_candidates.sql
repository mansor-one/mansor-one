begin;

alter table public.ath_movil_emails
  add column if not exists gmail_connection_id uuid,
  add column if not exists occurred_at timestamptz,
  add column if not exists timezone text not null default 'America/Puerto_Rico',
  add column if not exists reference text,
  add column if not exists counterparty_phone_last4 text,
  add column if not exists source_descriptor text,
  add column if not exists destination_descriptor text,
  add column if not exists parse_status text not null default 'partial',
  add column if not exists parser_version text not null default 'legacy',
  add column if not exists content_fingerprint text,
  add column if not exists parsed_fields jsonb not null default '{}'::jsonb,
  add column if not exists imported_at timestamptz not null default now();

alter table public.ath_movil_emails
  drop constraint if exists ath_movil_emails_phone_last4_check,
  add constraint ath_movil_emails_phone_last4_check
    check (counterparty_phone_last4 is null or counterparty_phone_last4 ~ '^[0-9]{4}$'),
  drop constraint if exists ath_movil_emails_parse_status_check,
  add constraint ath_movil_emails_parse_status_check
    check (parse_status in ('parsed', 'partial', 'failed'));

create unique index if not exists ath_movil_emails_connection_message_unique
  on public.ath_movil_emails(gmail_connection_id, gmail_message_id);
create index if not exists ath_movil_emails_household_fingerprint_idx
  on public.ath_movil_emails(household_id, content_fingerprint)
  where content_fingerprint is not null;
create unique index if not exists ath_movil_emails_id_household_unique
  on public.ath_movil_emails(id, household_id);
create unique index if not exists plaid_imports_id_household_unique
  on public.plaid_imports(id, household_id);

create table if not exists public.gmail_evidence_sync_state (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  last_history_id text,
  last_email_at timestamptz,
  last_attempt_at timestamptz,
  last_success_at timestamptz,
  encrypted_refresh_token text,
  token_iv text,
  token_auth_tag text,
  last_authorized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id)
);
create unique index if not exists gmail_evidence_sync_state_id_household_unique
  on public.gmail_evidence_sync_state(id, household_id);
alter table public.gmail_evidence_sync_state
  add column if not exists encrypted_refresh_token text,
  add column if not exists token_iv text,
  add column if not exists token_auth_tag text,
  add column if not exists last_authorized_at timestamptz;

alter table public.ath_movil_emails
  drop constraint if exists ath_movil_emails_gmail_connection_household_fk,
  add constraint ath_movil_emails_gmail_connection_household_fk
    foreign key (gmail_connection_id, household_id)
    references public.gmail_evidence_sync_state(id, household_id) on delete restrict;

create table if not exists public.ath_movil_match_candidates (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  ath_email_id uuid not null,
  plaid_import_id uuid not null,
  score integer not null check (score between 0 and 100),
  score_version text not null,
  reasons jsonb not null default '[]'::jsonb,
  rank integer not null check (rank > 0),
  status text not null default 'suggested'
    check (status in ('suggested', 'confirmed', 'rejected', 'superseded', 'stale')),
  created_at timestamptz not null default now(),
  evaluated_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  rejection_reason text,
  unique (ath_email_id, plaid_import_id),
  foreign key (ath_email_id, household_id)
    references public.ath_movil_emails(id, household_id) on delete cascade,
  foreign key (plaid_import_id, household_id)
    references public.plaid_imports(id, household_id) on delete cascade
);

create index if not exists ath_match_candidates_household_status_idx
  on public.ath_movil_match_candidates(household_id, status, rank);
create index if not exists ath_match_candidates_plaid_idx
  on public.ath_movil_match_candidates(plaid_import_id, status);
create unique index if not exists ath_match_candidates_one_confirmed_email_idx
  on public.ath_movil_match_candidates(ath_email_id)
  where status = 'confirmed';
create unique index if not exists ath_match_candidates_one_confirmed_plaid_idx
  on public.ath_movil_match_candidates(plaid_import_id)
  where status = 'confirmed';

create or replace function private.enforce_ath_candidate_lineage()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'UPDATE' and (
    new.household_id is distinct from old.household_id or
    new.ath_email_id is distinct from old.ath_email_id or
    new.plaid_import_id is distinct from old.plaid_import_id
  ) then
    raise exception 'ATH evidence lineage cannot be reassigned';
  end if;
  return new;
end;
$$;

drop trigger if exists ath_match_candidates_lineage_guard on public.ath_movil_match_candidates;
create trigger ath_match_candidates_lineage_guard
before update on public.ath_movil_match_candidates
for each row execute function private.enforce_ath_candidate_lineage();

drop trigger if exists ath_match_candidates_household_scope on public.ath_movil_match_candidates;
create trigger ath_match_candidates_household_scope
before insert or update on public.ath_movil_match_candidates
for each row execute function private.enforce_household_scope();
drop trigger if exists gmail_evidence_sync_state_household_scope on public.gmail_evidence_sync_state;
create trigger gmail_evidence_sync_state_household_scope
before insert or update on public.gmail_evidence_sync_state
for each row execute function private.enforce_household_scope();

alter table public.ath_movil_match_candidates enable row level security;
alter table public.gmail_evidence_sync_state enable row level security;
revoke insert, update, delete on public.ath_movil_emails from authenticated;
revoke all on public.ath_movil_match_candidates from anon;
revoke all on public.gmail_evidence_sync_state from anon;
revoke all on public.ath_movil_match_candidates from authenticated;
revoke all on public.gmail_evidence_sync_state from authenticated;
grant select on public.ath_movil_match_candidates to authenticated;
grant select, insert, update on public.ath_movil_emails to service_role;
grant select, insert, update on public.ath_movil_match_candidates to service_role;
grant select, insert, update on public.gmail_evidence_sync_state to service_role;

drop policy if exists ath_movil_emails_household_insert on public.ath_movil_emails;
drop policy if exists ath_movil_emails_household_update on public.ath_movil_emails;
drop policy if exists ath_movil_emails_household_delete on public.ath_movil_emails;
drop policy if exists ath_match_candidates_household_select on public.ath_movil_match_candidates;
drop policy if exists ath_match_candidates_household_insert on public.ath_movil_match_candidates;
drop policy if exists ath_match_candidates_household_update on public.ath_movil_match_candidates;
drop policy if exists gmail_evidence_sync_state_household_select on public.gmail_evidence_sync_state;

create policy ath_match_candidates_household_select
  on public.ath_movil_match_candidates for select to authenticated
  using ((select private.is_household_member(household_id)));

create or replace function public.decide_ath_movil_candidate(
  p_candidate_id uuid,
  p_household_id uuid,
  p_reviewed_by uuid,
  p_action text,
  p_rejection_reason text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  candidate_row public.ath_movil_match_candidates;
  next_status text;
  reviewed_time timestamptz := now();
begin
  if p_action not in ('confirm', 'reject') then
    raise exception 'Invalid ATH evidence decision' using errcode = '22023';
  end if;
  next_status := case when p_action = 'confirm' then 'confirmed' else 'rejected' end;

  select * into candidate_row
  from public.ath_movil_match_candidates
  where id = p_candidate_id
    and household_id = p_household_id
    and status = 'suggested'
  for update;
  if not found then
    raise exception 'ATH evidence candidate is unavailable' using errcode = 'P0002';
  end if;

  update public.ath_movil_match_candidates
  set status = next_status,
      reviewed_at = reviewed_time,
      reviewed_by = p_reviewed_by,
      rejection_reason = case when p_action = 'reject' then nullif(btrim(p_rejection_reason), '') else null end
  where id = candidate_row.id;

  if p_action = 'confirm' then
    update public.ath_movil_match_candidates
    set status = 'superseded',
        reviewed_at = reviewed_time,
        reviewed_by = p_reviewed_by
    where household_id = p_household_id
      and (
        ath_email_id = candidate_row.ath_email_id or
        plaid_import_id = candidate_row.plaid_import_id
      )
      and id <> candidate_row.id
      and status = 'suggested';
  end if;

  return jsonb_build_object('id', candidate_row.id, 'status', next_status);
end;
$$;

revoke all on function public.decide_ath_movil_candidate(uuid, uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.decide_ath_movil_candidate(uuid, uuid, uuid, text, text)
  to service_role;

comment on table public.ath_movil_match_candidates is
  'Manual-review evidence links only. Rows never create or modify ledger transactions.';
comment on table public.gmail_evidence_sync_state is
  'Server-only incremental Gmail state with an encrypted household refresh token.';

commit;

-- Rollback: drop the two new tables and their private trigger function, then
-- remove only the columns/indexes added to ath_movil_emails. Legacy ATH tables
-- and all ledger data remain untouched.
