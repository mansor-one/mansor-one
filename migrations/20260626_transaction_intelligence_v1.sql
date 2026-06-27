create extension if not exists pgcrypto;

create table if not exists public.transaction_suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  quick_entry_id uuid null,
  plaid_import_id uuid null,
  source text not null,
  suggested_category text not null,
  confidence_score numeric null,
  reason text null,
  status text not null default 'suggested',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transaction_suggestions_status_check
    check (status in ('suggested', 'needs_review', 'confirmed', 'rejected', 'ignored'))
);

create table if not exists public.transaction_review_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  suggestion_id uuid not null references public.transaction_suggestions(id) on delete cascade,
  question text not null,
  status text not null default 'pending',
  answer text null,
  resolved_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transaction_review_items_status_check
    check (status in ('pending', 'resolved', 'ignored'))
);

create table if not exists public.transaction_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  rule_type text not null,
  pattern text not null,
  category text not null,
  owner text null,
  confidence_score numeric null,
  source text null,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.transaction_enrichments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  quick_entry_id uuid null,
  plaid_import_id uuid null,
  enrichment_source text not null,
  enrichment_type text not null,
  matched_value text null,
  confidence_score numeric null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.transaction_suggestions enable row level security;
alter table public.transaction_review_items enable row level security;
alter table public.transaction_rules enable row level security;
alter table public.transaction_enrichments enable row level security;

grant select, insert, update on public.transaction_suggestions to authenticated;
grant select, insert, update on public.transaction_review_items to authenticated;
grant select, insert, update on public.transaction_rules to authenticated;
grant select, insert, update on public.transaction_enrichments to authenticated;

create policy "transaction_suggestions_select_own"
  on public.transaction_suggestions
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "transaction_suggestions_insert_own"
  on public.transaction_suggestions
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "transaction_suggestions_update_own"
  on public.transaction_suggestions
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "transaction_review_items_select_own"
  on public.transaction_review_items
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "transaction_review_items_insert_own"
  on public.transaction_review_items
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "transaction_review_items_update_own"
  on public.transaction_review_items
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "transaction_rules_select_own"
  on public.transaction_rules
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "transaction_rules_insert_own"
  on public.transaction_rules
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "transaction_rules_update_own"
  on public.transaction_rules
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "transaction_enrichments_select_own"
  on public.transaction_enrichments
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "transaction_enrichments_insert_own"
  on public.transaction_enrichments
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "transaction_enrichments_update_own"
  on public.transaction_enrichments
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists transaction_suggestions_user_id_idx
  on public.transaction_suggestions(user_id);
create index if not exists transaction_suggestions_status_idx
  on public.transaction_suggestions(status);
create index if not exists transaction_suggestions_plaid_import_id_idx
  on public.transaction_suggestions(plaid_import_id);
create index if not exists transaction_suggestions_quick_entry_id_idx
  on public.transaction_suggestions(quick_entry_id);

create index if not exists transaction_review_items_user_id_idx
  on public.transaction_review_items(user_id);
create index if not exists transaction_review_items_status_idx
  on public.transaction_review_items(status);
create index if not exists transaction_review_items_suggestion_id_idx
  on public.transaction_review_items(suggestion_id);

create index if not exists transaction_rules_user_id_idx
  on public.transaction_rules(user_id);
create index if not exists transaction_rules_rule_type_pattern_idx
  on public.transaction_rules(rule_type, pattern);

create index if not exists transaction_enrichments_user_id_idx
  on public.transaction_enrichments(user_id);
create index if not exists transaction_enrichments_plaid_import_id_idx
  on public.transaction_enrichments(plaid_import_id);
create index if not exists transaction_enrichments_quick_entry_id_idx
  on public.transaction_enrichments(quick_entry_id);
