-- Compare the drawing the capture form displayed while holding the project lock.
-- Direct clients that supply coordinates against the current drawing can omit this UI concurrency token.
create or replace function public.save_observation(p jsonb) returns uuid language plpgsql security invoker set search_path = '' as $$
declare v public.visits; pr public.projects; item uuid; existing uuid;
begin
 select * into strict v from public.visits where id=(p->>'visit_id')::uuid and user_id=auth.uid();
 select * into strict pr from public.projects where id=v.project_id for update;
 select item_id into existing from public.evidence where id=(p->>'request_id')::uuid and user_id=auth.uid();
 if existing is not null then return existing; end if;
 if p ? 'expected_drawing_path' and pr.drawing_path is distinct from nullif(p->>'expected_drawing_path','') then
   raise exception 'Project drawing changed during capture';
 end if;
 item=nullif(p->>'item_id','')::uuid;
 if item is null then
 insert into public.items(user_id,project_id,number,title) values(auth.uid(),v.project_id,1,p->>'title') returning id into item;
 end if;
 insert into public.evidence(id,user_id,project_id,visit_id,item_id,title,raw_notes,category,priority,status,action_required,responsible,due_date,photo_path,photo_marker,drawing_path,drawing_reference,drawing_pin,location)
 values((p->>'request_id')::uuid,auth.uid(),v.project_id,v.id,item,p->>'title',p->>'raw_notes',p->>'category',p->>'priority',p->>'status',p->>'action_required',p->>'responsible',nullif(p->>'due_date','')::date,p->>'photo_path',nullif(p->'photo_marker','null'::jsonb),pr.drawing_path,pr.drawing_reference,nullif(p->'drawing_pin','null'::jsonb),p->>'location');
 return item;
end $$;
