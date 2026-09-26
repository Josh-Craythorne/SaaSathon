-- The demo is explicit, per-account and transactional. The advisory lock makes repeated/concurrent clicks safe.
create function public.load_sitescribe_demo(paths text[]) returns uuid language plpgsql security invoker set search_path = '' as $$
declare pr uuid; v1 uuid; v2 uuid; item uuid; n int; titles text[]:=array['Foundation reinforcement — grid B2','Surface water channel — east boundary','Retaining wall drainage — north end'];
 notes text[]:=array['Sample engineer note: reinforcement photographed at grid B2 before the pour. Site supervisor to provide the inspection record for this location.','Sample engineer note: standing water recorded beside the temporary east boundary channel. Contractor to confirm the drainage arrangements for the next visit.','Sample engineer note: drainage outlet at the north end of the retaining wall photographed. Contractor to provide the installation record.'];
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 select id into pr from public.projects where user_id=auth.uid() and demo;
 if pr is not null then return pr; end if;
 if array_length(paths,1)<>4 then raise exception 'Four demo images required'; end if;
 insert into public.projects(user_id,name,reference,address,client,drawing_path,drawing_reference,demo)
 values(auth.uid(),'Riverside Works · Fictional demo','DEMO-026','18 Example Quay, Fictional City','Example Developments (fictional)',paths[1],'DEMO S-01 · Revision A',true) returning id into pr;
 insert into public.visits(user_id,project_id,date,engineer,weather,scope,limitations) values(auth.uid(),pr,'2026-09-21','Alex Morgan (sample engineer)','Overcast, light showers','Sample visual observations of accessible foundation, drainage and retaining wall work.','Fictional demonstration only. Placeholder illustrations are not site photographs. Concealed work was not inspected.') returning id into v1;
 insert into public.visits(user_id,project_id,date,engineer,weather,scope,limitations) values(auth.uid(),pr,'2026-09-24','Alex Morgan (sample engineer)','Fine','Follow-up on previously recorded items.','Fictional demonstration only. No engineering assessment is represented.') returning id into v2;
 for n in 1..3 loop
 item:=public.save_observation(jsonb_build_object('request_id',gen_random_uuid(),'visit_id',v1,'item_id','','title',titles[n],'raw_notes',notes[n],'category',(array['Structural','Civil','Geotechnical'])[n],'priority','Routine','status','Open','action_required',(array['Provide inspection record.','Confirm drainage arrangements.','Provide installation record.'])[n],'responsible','Example Contractor','due_date','2026-09-28','photo_path',paths[n+1],'photo_marker',jsonb_build_object('x',0.5,'y',0.55),'drawing_pin',jsonb_build_object('x',0.25*n,'y',0.4),'location',(array['Grid B2','East boundary','North retaining wall'])[n]));
 perform public.save_observation(jsonb_build_object('request_id',gen_random_uuid(),'visit_id',v2,'item_id',item,'title',titles[n],'raw_notes',case when n=1 then 'Sample engineer follow-up: the requested inspection record was provided and checked. This documentation item is recorded as resolved by the sample engineer.' else 'Sample engineer follow-up: requested documentation remains outstanding at this visit.' end,'category',(array['Structural','Civil','Geotechnical'])[n],'priority','Routine','status',case when n=1 then 'Resolved' else 'Open' end,'action_required',case when n=1 then 'No further action recorded.' else 'Provide the requested documentation.' end,'responsible','Example Contractor','due_date','2026-09-28','photo_path',paths[n+1],'photo_marker',null,'drawing_pin',jsonb_build_object('x',0.25*n,'y',0.4),'location',(array['Grid B2','East boundary','North retaining wall'])[n]));
 end loop;
 return pr;
end $$;
revoke all on function public.load_sitescribe_demo(text[]) from public,anon;
grant execute on function public.load_sitescribe_demo(text[]) to authenticated;
