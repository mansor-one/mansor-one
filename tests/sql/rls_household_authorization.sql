-- Run only against an ephemeral/local database after both 20260721 migrations:
-- psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f tests/sql/rls_household_authorization.sql
-- The transaction always rolls back.

begin;

set local role postgres;

insert into auth.users (id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('10000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'rls-a@example.test', '', now(), now()),
  ('10000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'rls-b@example.test', '', now(), now()),
  ('10000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'rls-c@example.test', '', now(), now())
on conflict (id) do nothing;

insert into public.households (id, name, created_by)
values
  ('20000000-0000-0000-0000-000000000001', 'Hogar compartido', '10000000-0000-0000-0000-000000000001'),
  ('20000000-0000-0000-0000-000000000002', 'Hogar aislado', '10000000-0000-0000-0000-000000000003')
on conflict (id) do nothing;

insert into public.household_members (id, name, household_id, auth_user_id, role, active)
values
  ('30000000-0000-0000-0000-000000000001', 'Usuario A', '20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'owner', true),
  ('30000000-0000-0000-0000-000000000002', 'Usuario B', '20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 'member', true),
  ('30000000-0000-0000-0000-000000000003', 'Usuario C', '20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000003', 'owner', true)
on conflict (id) do nothing;

insert into public.accounts (id, name, user_id, household_id, balance)
values (
  '40000000-0000-0000-0000-000000000001',
  'Cuenta de prueba RLS',
  '10000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  100
)
on conflict (id) do update set balance = excluded.balance;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);

do $$
begin
  if (select count(*) from public.accounts where id = '40000000-0000-0000-0000-000000000001') <> 1 then
    raise exception 'same-household member could not read the shared row';
  end if;

  update public.accounts
  set balance = 125
  where id = '40000000-0000-0000-0000-000000000001';
  if not found then
    raise exception 'same-household member could not update the shared row';
  end if;

  insert into public.accounts (id, name, user_id, household_id, balance)
  values (
    '40000000-0000-0000-0000-000000000003',
    'Cuenta creada por miembro',
    '10000000-0000-0000-0000-000000000002',
    '20000000-0000-0000-0000-000000000001',
    25
  );
  delete from public.accounts
  where id = '40000000-0000-0000-0000-000000000003';
  if not found then
    raise exception 'same-household member could not delete a shared row';
  end if;
end
$$;

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);

do $$
begin
  if exists (select 1 from public.accounts where id = '40000000-0000-0000-0000-000000000001') then
    raise exception 'different-household user read a foreign row';
  end if;

  update public.accounts
  set balance = 999
  where id = '40000000-0000-0000-0000-000000000001';
  if found then
    raise exception 'different-household user updated a foreign row';
  end if;

  delete from public.accounts
  where id = '40000000-0000-0000-0000-000000000001';
  if found then
    raise exception 'different-household user deleted a foreign row';
  end if;

  begin
    insert into public.accounts (id, name, user_id, household_id, balance)
    values (
      '40000000-0000-0000-0000-000000000002',
      'Inserción ajena',
      '10000000-0000-0000-0000-000000000003',
      '20000000-0000-0000-0000-000000000001',
      1
    );
    raise exception 'different-household insert unexpectedly succeeded';
  exception
    when insufficient_privilege then null;
    when check_violation then null;
    when raise_exception then
      if sqlerrm = 'different-household insert unexpectedly succeeded' then
        raise;
      end if;
  end;
end
$$;

reset role;
set local role anon;
select set_config('request.jwt.claim.role', 'anon', true);
select set_config('request.jwt.claim.sub', '', true);

do $$
begin
  begin
    if exists (select 1 from public.accounts) then
      raise exception 'anonymous user read household data';
    end if;
  exception
    when insufficient_privilege then null;
  end;
end
$$;

rollback;
