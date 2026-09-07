begin;

-- Phase 1A keeps lib/financial-engine/categories.ts as the canonical category
-- registry. This migration stores its stable category.code on new suggestions;
-- it intentionally does not create or depend on transaction_categories.

alter table public.transaction_enrichments
  add column if not exists ath_movil_email_id uuid null
    references public.ath_movil_emails(id) on delete restrict,
  add column if not exists ath_match_candidate_id uuid null
    references public.ath_movil_match_candidates(id) on delete restrict,
  add column if not exists related_person_id uuid null
    references public.people(id) on delete set null,
  add column if not exists purpose text null,
  add column if not exists reasons jsonb not null default '[]'::jsonb,
  add column if not exists extractor_version text null,
  add column if not exists status text not null default 'active';

alter table public.transaction_enrichments
  drop constraint if exists transaction_enrichments_status_check,
  add constraint transaction_enrichments_status_check
    check (status in ('active', 'ambiguous', 'insufficient_context', 'stale'));

alter table public.transaction_suggestions
  add column if not exists enrichment_id uuid null
    references public.transaction_enrichments(id) on delete cascade,
  add column if not exists suggested_category_code text null,
  add column if not exists rank integer not null default 1,
  add column if not exists interpreter_version text null;

alter table public.transaction_suggestions
  drop constraint if exists transaction_suggestions_rank_check,
  add constraint transaction_suggestions_rank_check check (rank > 0);

-- Review items are historical records. A suggestion with review history must
-- not be deleted implicitly through the existing CASCADE relationship.
alter table public.transaction_review_items
  drop constraint if exists transaction_review_items_suggestion_id_fkey,
  add constraint transaction_review_items_suggestion_id_fkey
    foreign key (suggestion_id)
    references public.transaction_suggestions(id) on delete restrict;

create unique index if not exists transaction_enrichments_ath_context_unique_idx
  on public.transaction_enrichments(
    household_id,
    ath_match_candidate_id,
    enrichment_type
  );

create unique index if not exists transaction_suggestions_context_category_unique_idx
  on public.transaction_suggestions(
    household_id,
    enrichment_id,
    suggested_category_code
  );

drop index if exists public.transaction_review_items_suggestion_unique_idx;

-- Preserve resolved/ignored history while preventing two simultaneously
-- actionable review items for the same suggestion.
create unique index transaction_review_items_suggestion_unique_idx
  on public.transaction_review_items(household_id, suggestion_id)
  where status = 'pending';

create index if not exists transaction_enrichments_ath_email_idx
  on public.transaction_enrichments(ath_movil_email_id);
create index if not exists transaction_enrichments_ath_candidate_idx
  on public.transaction_enrichments(ath_match_candidate_id);
create index if not exists transaction_enrichments_related_person_idx
  on public.transaction_enrichments(related_person_id);
create index if not exists transaction_suggestions_enrichment_idx
  on public.transaction_suggestions(enrichment_id);
create index if not exists transaction_suggestions_category_code_idx
  on public.transaction_suggestions(suggested_category_code);

comment on column public.transaction_suggestions.suggested_category_code is
  'Stable category.code from lib/financial-engine/categories.ts; suggested_category remains a compatibility display label.';
comment on column public.transaction_enrichments.ath_match_candidate_id is
  'Evidence relationship only. It never authorizes writes to financial authority tables.';

commit;

-- No data backfill is included. Apply only after reviewing existing review-item
-- uniqueness and deploying the Phase 1A application code.
