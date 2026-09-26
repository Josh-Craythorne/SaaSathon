-- Add immutable version metadata without changing stored evidence or snapshot JSON.
alter table public.reports add column version integer;
with numbered as (
  select id, row_number() over(partition by visit_id order by created_at, id) as n
  from public.reports
)
update public.reports r set version = numbered.n from numbered where r.id = numbered.id;
alter table public.reports alter column version set not null;
alter table public.reports add constraint report_positive_version check(version > 0);
alter table public.reports add constraint report_visit_version unique(visit_id, version);
alter table public.reports add constraint report_owned_identity unique(id, visit_id, project_id, user_id);
alter table public.reports add column source_report_id uuid;
alter table public.reports add constraint report_owned_source
  foreign key(source_report_id, visit_id, project_id, user_id)
  references public.reports(id, visit_id, project_id, user_id);

create function public.number_report_version() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  -- The same lock used by capture serializes concurrent saves for this project.
  perform 1 from public.projects where id=new.project_id and user_id=new.user_id for update;
  select coalesce(max(version),0)+1 into new.version from public.reports where visit_id=new.visit_id;
  return new;
end $$;
create trigger allocate_report_version before insert on public.reports
  for each row execute function public.number_report_version();
revoke all on function public.number_report_version() from public, anon, authenticated;
-- Existing SELECT/INSERT grants and ownership RLS continue to apply. No UPDATE/DELETE grants.
