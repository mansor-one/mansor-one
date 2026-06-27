create table if not exists public.transaction_categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null,
  code text not null,
  label text not null,
  parent_id uuid null references public.transaction_categories(id) on delete set null,
  kind text not null default 'expense',
  is_system boolean not null default false,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transaction_categories_kind_check
    check (kind in ('expense', 'income', 'transfer', 'payment', 'adjustment')),
  constraint transaction_categories_system_user_check
    check (
      (is_system = true and user_id is null)
      or
      (is_system = false and user_id is not null)
    )
);

alter table public.transaction_categories enable row level security;

grant select, insert, update on public.transaction_categories to authenticated;

create policy "transaction_categories_select_system_or_own"
  on public.transaction_categories
  for select
  to authenticated
  using (
    (is_system = true and user_id is null)
    or
    ((select auth.uid()) = user_id)
  );

create policy "transaction_categories_insert_own_user_categories"
  on public.transaction_categories
  for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
    and is_system = false
  );

create policy "transaction_categories_update_own_user_categories"
  on public.transaction_categories
  for update
  to authenticated
  using (
    (select auth.uid()) = user_id
    and is_system = false
  )
  with check (
    (select auth.uid()) = user_id
    and is_system = false
  );

create index if not exists transaction_categories_user_id_idx
  on public.transaction_categories(user_id);
create index if not exists transaction_categories_code_idx
  on public.transaction_categories(code);
create index if not exists transaction_categories_parent_id_idx
  on public.transaction_categories(parent_id);
create index if not exists transaction_categories_kind_idx
  on public.transaction_categories(kind);
create index if not exists transaction_categories_is_active_idx
  on public.transaction_categories(is_active);

with seed(code, label, kind, sort_order) as (
  values
    ('comida', 'Comida', 'expense', 10),
    ('salud', 'Salud', 'expense', 20),
    ('transporte', 'Transporte', 'expense', 30),
    ('casa', 'Casa', 'expense', 40),
    ('familia', 'Familia', 'expense', 50),
    ('negocio_soraya', 'Negocio Soraya', 'expense', 60),
    ('tecnologia', 'Tecnología', 'expense', 70),
    ('deudas', 'Deudas', 'payment', 80),
    ('financiero', 'Financiero', 'adjustment', 90),
    ('entretenimiento', 'Entretenimiento', 'expense', 100),
    ('educacion', 'Educación', 'expense', 110),
    ('otros', 'Otros', 'expense', 120)
)
insert into public.transaction_categories (
  code,
  label,
  kind,
  is_system,
  sort_order
)
select
  seed.code,
  seed.label,
  seed.kind,
  true,
  seed.sort_order
from seed
where not exists (
  select 1
  from public.transaction_categories existing
  where existing.code = seed.code
    and existing.is_system = true
    and existing.user_id is null
);

with seed(parent_code, code, label, kind, sort_order) as (
  values
    ('comida', 'comida_fuera', 'Comida fuera', 'expense', 11),
    ('comida', 'supermercado', 'Supermercado', 'expense', 12),
    ('comida', 'cafeteria_trabajo', 'Cafetería trabajo', 'expense', 13),
    ('salud', 'farmacia', 'Farmacia', 'expense', 21),
    ('salud', 'medico_laboratorio', 'Médico / Laboratorio', 'expense', 22),
    ('transporte', 'gasolina', 'Gasolina', 'expense', 31),
    ('transporte', 'parking', 'Parking', 'expense', 32),
    ('transporte', 'autoexpreso', 'AutoExpreso', 'expense', 33),
    ('casa', 'servicios', 'Servicios', 'expense', 41),
    ('casa', 'compras_hogar', 'Compras del hogar', 'expense', 42),
    ('familia', 'andrea', 'Andrea', 'expense', 51),
    ('familia', 'gaby', 'Gaby', 'expense', 52),
    ('familia', 'soraya', 'Soraya', 'expense', 53),
    ('tecnologia', 'software_suscripciones', 'Software / Suscripciones', 'expense', 71),
    ('deudas', 'pago_tarjeta', 'Pago de tarjeta', 'payment', 81),
    ('deudas', 'prestamo', 'Préstamo', 'payment', 82),
    ('financiero', 'transferencia', 'Transferencia', 'transfer', 91),
    ('financiero', 'ingreso', 'Ingreso', 'income', 92),
    ('financiero', 'efectivo', 'Efectivo', 'adjustment', 93)
),
parents as (
  select id, code
  from public.transaction_categories
  where is_system = true
    and user_id is null
)
insert into public.transaction_categories (
  code,
  label,
  parent_id,
  kind,
  is_system,
  sort_order
)
select
  seed.code,
  seed.label,
  parents.id,
  seed.kind,
  true,
  seed.sort_order
from seed
join parents on parents.code = seed.parent_code
where not exists (
  select 1
  from public.transaction_categories existing
  where existing.code = seed.code
    and existing.is_system = true
    and existing.user_id is null
);
