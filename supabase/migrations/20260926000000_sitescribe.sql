-- Incremental: legacy ideas and accounts are preserved. Evidence and reports are append-only.
create table public.projects (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users on delete cascade,
 name text not null check (length(btrim(name)) between 1 and 240), reference text not null check(length(btrim(reference)) between 1 and 240),
 address text not null check(length(btrim(address)) between 1 and 240), client text not null check(length(btrim(client)) between 1 and 240),
 drawing_path text, drawing_reference text not null default '' check(length(drawing_reference)<=240), demo boolean not null default false,
 created_at timestamptz not null default now(), unique(id,user_id),
 check(drawing_path is null or drawing_path ~ ('^' || user_id::text || '/[a-f0-9-]{36}\.(png|jpg)$'))
);
create unique index one_demo_per_owner on public.projects(user_id) where demo;
create table public.visits (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users on delete cascade, project_id uuid not null,
 date date not null, engineer text not null check(length(btrim(engineer)) between 1 and 240), weather text not null default '' check(length(weather)<=240),
 scope text not null default '' check(length(scope)<=10000), limitations text not null default '' check(length(limitations)<=10000), created_at timestamptz not null default now(),
 unique(id,project_id,user_id), foreign key(project_id,user_id) references public.projects(id,user_id) on delete cascade
);
create table public.items (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users on delete cascade, project_id uuid not null,
 number integer not null check(number>0), title text not null check(length(btrim(title)) between 1 and 240), created_at timestamptz not null default now(),
 unique(project_id,number), unique(id,project_id,user_id), foreign key(project_id,user_id) references public.projects(id,user_id) on delete cascade
);
create table public.evidence (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users on delete cascade, project_id uuid not null, visit_id uuid not null, item_id uuid not null,
 sequence bigint generated always as identity, title text not null check(length(btrim(title)) between 1 and 240),
 raw_notes text not null check(length(btrim(raw_notes)) between 1 and 10000), category text not null check(category in ('Civil','Structural','Geotechnical','General')),
 priority text not null check(priority in ('Routine','Priority','Urgent')), status text not null check(status in ('Open','In progress','Resolved')),
 action_required text not null default '' check(length(action_required)<=10000), responsible text not null default '' check(length(responsible)<=240), due_date date,
 photo_path text not null default '', photo_marker jsonb, drawing_path text, drawing_reference text not null default '' check(length(drawing_reference)<=240), drawing_pin jsonb,
 location text not null default '' check(length(location)<=240), created_at timestamptz not null default now(),
 foreign key(project_id,user_id) references public.projects(id,user_id) on delete cascade,
 foreign key(visit_id,project_id,user_id) references public.visits(id,project_id,user_id) on delete cascade,
 foreign key(item_id,project_id,user_id) references public.items(id,project_id,user_id) on delete cascade,
 check(photo_path = '' or photo_path ~ ('^' || user_id::text || '/[a-f0-9-]{36}\.(png|jpg)$')),
 check(drawing_path is null or drawing_path ~ ('^' || user_id::text || '/[a-f0-9-]{36}\.(png|jpg)$')),
 check(photo_marker is null or photo_path <> ''), check(drawing_pin is null or drawing_path is not null)
);
create function public.valid_point(p jsonb) returns boolean language sql immutable set search_path = '' as $$
 select p is null or (jsonb_typeof(p)='object' and p ? 'x' and p ? 'y' and jsonb_typeof(p->'x')='number' and jsonb_typeof(p->'y')='number' and (p->>'x')::numeric between 0 and 1 and (p->>'y')::numeric between 0 and 1)
$$;
alter table public.evidence add check(public.valid_point(photo_marker) and public.valid_point(drawing_pin));
create table public.reports (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users on delete cascade, project_id uuid not null, visit_id uuid not null,
 snapshot jsonb not null check(jsonb_typeof(snapshot)='object' and octet_length(snapshot::text)<=2000000), state text not null check(state in ('Draft','Reviewed')),
 reviewed_at timestamptz, created_at timestamptz not null default now(),
 foreign key(visit_id,project_id,user_id) references public.visits(id,project_id,user_id) on delete cascade,
 check((state='Reviewed') = (reviewed_at is not null))
);
-- No UPDATE/DELETE grants for historical records: follow-ups and edits create new versions.
do $$ declare t text; begin
 foreach t in array array['projects','visits','items','evidence','reports'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon, authenticated',t);
 execute format('grant select, insert on public.%I to authenticated',t);
 execute format('create policy "Read own records" on public.%I for select to authenticated using ((select auth.uid())=user_id)',t);
 execute format('create policy "Insert own records" on public.%I for insert to authenticated with check ((select auth.uid())=user_id)',t);
 execute format('create index on public.%I(user_id)',t);
 end loop;
end $$;
grant update(drawing_path,drawing_reference) on public.projects to authenticated;
create policy "Update own drawing" on public.projects for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
grant usage on sequence public.evidence_sequence_seq to authenticated;
create index on public.evidence(project_id,sequence);
create index on public.visits(project_id,date);
create index on public.reports(visit_id,created_at);

-- Serialize reference allocation per project; safe under concurrent mobile submissions.
create function public.number_item() returns trigger language plpgsql set search_path = '' as $$
begin
 perform 1 from public.projects where id=new.project_id and user_id=new.user_id for update;
 select coalesce(max(number),0)+1 into new.number from public.items where project_id=new.project_id;
 return new;
end $$;
create trigger allocate_item_number before insert on public.items for each row execute function public.number_item();

create function public.save_observation(p jsonb) returns uuid language plpgsql security invoker set search_path = '' as $$
declare v public.visits; pr public.projects; item uuid; existing uuid;
begin
 select * into strict v from public.visits where id=(p->>'visit_id')::uuid and user_id=auth.uid();
 select * into strict pr from public.projects where id=v.project_id for update;
 select item_id into existing from public.evidence where id=(p->>'request_id')::uuid and user_id=auth.uid();
 if existing is not null then return existing; end if;
 item=nullif(p->>'item_id','')::uuid;
 if item is null then
 insert into public.items(user_id,project_id,number,title) values(auth.uid(),v.project_id,1,p->>'title') returning id into item;
 end if;
 insert into public.evidence(id,user_id,project_id,visit_id,item_id,title,raw_notes,category,priority,status,action_required,responsible,due_date,photo_path,photo_marker,drawing_path,drawing_reference,drawing_pin,location)
 values((p->>'request_id')::uuid,auth.uid(),v.project_id,v.id,item,p->>'title',p->>'raw_notes',p->>'category',p->>'priority',p->>'status',p->>'action_required',p->>'responsible',nullif(p->>'due_date','')::date,p->>'photo_path',nullif(p->'photo_marker','null'::jsonb),pr.drawing_path,pr.drawing_reference,nullif(p->'drawing_pin','null'::jsonb),p->>'location');
 return item;
end $$;
revoke all on function public.save_observation(jsonb) from public,anon;
grant execute on function public.save_observation(jsonb) to authenticated;
revoke all on function public.number_item() from public,anon,authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('sitescribe','sitescribe',false,8388608,array['image/png','image/jpeg']);
create policy "Upload own evidence" on storage.objects for insert to authenticated with check(bucket_id='sitescribe' and (storage.foldername(name))[1]=(select auth.uid())::text and name ~ ('^' || (select auth.uid())::text || '/[a-f0-9-]{36}\.(png|jpg)$'));
create policy "Read own evidence" on storage.objects for select to authenticated using(bucket_id='sitescribe' and (storage.foldername(name))[1]=(select auth.uid())::text);
-- Originals cannot be overwritten/deleted by clients, keeping reviewed snapshots reproducible.
