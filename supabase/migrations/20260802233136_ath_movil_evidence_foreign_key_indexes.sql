begin;

create index if not exists ath_movil_emails_connection_household_idx
  on public.ath_movil_emails(gmail_connection_id, household_id);

create index if not exists ath_match_candidates_email_household_idx
  on public.ath_movil_match_candidates(ath_email_id, household_id);

create index if not exists ath_match_candidates_import_household_idx
  on public.ath_movil_match_candidates(plaid_import_id, household_id);

create index if not exists ath_match_candidates_reviewed_by_idx
  on public.ath_movil_match_candidates(reviewed_by)
  where reviewed_by is not null;

commit;

-- Rollback:
-- drop index if exists public.ath_match_candidates_reviewed_by_idx;
-- drop index if exists public.ath_match_candidates_import_household_idx;
-- drop index if exists public.ath_match_candidates_email_household_idx;
-- drop index if exists public.ath_movil_emails_connection_household_idx;
