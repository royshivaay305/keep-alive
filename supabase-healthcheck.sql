create table if not exists public.healthcheck (
  id bigint generated always as identity primary key,
  note text not null default 'ok',
  created_at timestamp with time zone not null default now()
);

alter table public.healthcheck enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'healthcheck'
      and policyname = 'Allow anon read healthcheck'
  ) then
    create policy "Allow anon read healthcheck"
    on public.healthcheck
    for select
    to anon
    using (true);
  end if;
end
$$;

insert into public.healthcheck (note)
select 'ok'
where not exists (
  select 1
  from public.healthcheck
);
