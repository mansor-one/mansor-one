-- Run against an ephemeral/local database after all 20260721 RLS migrations:
-- psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f tests/sql/rls_missing_tables_authorization.sql
-- The transaction always rolls back.

begin;

set local role postgres;

insert into auth.users (id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('51000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'missing-a@example.test', '', now(), now()),
  ('51000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'missing-b@example.test', '', now(), now()),
  ('51000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'missing-c@example.test', '', now(), now())
on conflict (id) do nothing;

insert into public.households (id, name, created_by)
values
  ('52000000-0000-0000-0000-000000000001', 'Hogar AB', '51000000-0000-0000-0000-000000000001'),
  ('52000000-0000-0000-0000-000000000002', 'Hogar C', '51000000-0000-0000-0000-000000000003')
on conflict (id) do nothing;

insert into public.household_members (id, name, household_id, auth_user_id, role, active)
values
  ('53000000-0000-0000-0000-000000000001', 'A', '52000000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001', 'owner', true),
  ('53000000-0000-0000-0000-000000000002', 'B', '52000000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000002', 'member', true),
  ('53000000-0000-0000-0000-000000000003', 'C', '52000000-0000-0000-0000-000000000002', '51000000-0000-0000-0000-000000000003', 'owner', true)
on conflict (id) do nothing;

insert into public.transactions (id, transaction_date, description, amount, transaction_type, household_id)
values ('54000000-0000-0000-0000-000000000001', current_date, 'Fila hogar AB', 10, 'expense', '52000000-0000-0000-0000-000000000001')
on conflict (id) do nothing;

insert into public.pablo_questions (id, user_id, question)
values ('55000000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001', 'Pregunta privada A')
on conflict (id) do nothing;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '51000000-0000-0000-0000-000000000002', true);

do $$
begin
  if not exists (select 1 from public.transactions where id = '54000000-0000-0000-0000-000000000001') then
    raise exception 'same-household user could not read transaction';
  end if;
  if exists (select 1 from public.pablo_questions where id = '55000000-0000-0000-0000-000000000001') then
    raise exception 'different user read personal pablo question';
  end if;
  begin
    perform 1 from public.categories limit 1;
    raise exception 'authenticated user accessed server-only categories';
  exception
    when insufficient_privilege then null;
    when raise_exception then
      if sqlerrm = 'authenticated user accessed server-only categories' then raise; end if;
  end;
end
$$;

select set_config('request.jwt.claim.sub', '51000000-0000-0000-0000-000000000003', true);

do $$
begin
  if exists (select 1 from public.transactions where id = '54000000-0000-0000-0000-000000000001') then
    raise exception 'different household read transaction';
  end if;
  update public.transactions set amount = 99
  where id = '54000000-0000-0000-0000-000000000001';
  if found then
    raise exception 'different household updated transaction';
  end if;
end
$$;

select set_config('request.jwt.claim.sub', '51000000-0000-0000-0000-000000000001', true);

do $$
begin
  if not exists (select 1 from public.pablo_questions where id = '55000000-0000-0000-0000-000000000001') then
    raise exception 'owner could not read personal pablo question';
  end if;
end
$$;

rollback;
