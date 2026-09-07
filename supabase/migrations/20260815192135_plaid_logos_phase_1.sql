alter table public.plaid_connections
  add column if not exists institution_id text;

alter table public.plaid_imports
  add column if not exists merchant_entity_id text,
  add column if not exists merchant_logo_url text,
  add column if not exists merchant_website text,
  add column if not exists merchant_confidence text,
  add column if not exists merchant_logo_source text;

alter table public.plaid_imports
  add constraint plaid_imports_merchant_confidence_check
    check (merchant_confidence is null or merchant_confidence in ('HIGH', 'VERY_HIGH')),
  add constraint plaid_imports_merchant_logo_source_check
    check (merchant_logo_source is null or merchant_logo_source in ('transaction', 'counterparty'));

create index if not exists plaid_connections_institution_id_idx
  on public.plaid_connections(institution_id)
  where institution_id is not null;

create index if not exists plaid_imports_merchant_entity_id_idx
  on public.plaid_imports(merchant_entity_id)
  where merchant_entity_id is not null;

create table public.plaid_institution_assets (
  institution_id text primary key,
  official_name text not null,
  logo_base64 text,
  website text,
  primary_color text,
  fetched_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint plaid_institution_assets_primary_color_check
    check (primary_color is null or primary_color ~ '^#[0-9A-Fa-f]{6}$')
);

comment on table public.plaid_institution_assets is
  'Presentation-only cache of official institution metadata returned by Plaid.';
comment on column public.plaid_institution_assets.logo_base64 is
  'Validated Plaid PNG payload without a data URL prefix.';

alter table public.plaid_institution_assets enable row level security;

revoke all on table public.plaid_institution_assets from anon, authenticated, service_role;
grant select, insert, update on table public.plaid_institution_assets to service_role;
