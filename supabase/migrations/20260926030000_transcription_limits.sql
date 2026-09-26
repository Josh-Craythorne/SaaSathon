create schema if not exists private;
revoke all on schema private from public,anon,authenticated;
create table private.transcription_requests(user_id uuid not null references auth.users on delete cascade,id uuid not null,visit_id uuid not null references public.visits on delete cascade,digest text not null,attempts int not null default 1,created_at timestamptz not null default now(),lease uuid,expires_at timestamptz,transcript text check(length(transcript)<=10000),primary key(user_id,id));
alter table private.transcription_requests enable row level security;
revoke all on private.transcription_requests from public,anon,authenticated;
create function public.begin_transcription(p_id uuid,p_visit uuid,p_digest text) returns jsonb language plpgsql security definer set search_path='' as $$
declare r private.transcription_requests; token uuid:=gen_random_uuid(); begin
 if auth.uid() is null or not exists(select 1 from public.visits where id=p_visit and user_id=auth.uid()) then raise exception 'Visit not available'; end if;
 if p_digest !~ '^[a-f0-9]{64}$' then raise exception 'Invalid digest'; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,42));
 delete from private.transcription_requests where user_id=auth.uid() and created_at<now()-interval '24 hours';
 select * into r from private.transcription_requests where user_id=auth.uid() and id=p_id;
 if r.id is not null and (r.digest<>p_digest or r.visit_id<>p_visit) then return jsonb_build_object('error','Recording identifier conflict. Start a new recording.'); end if;
 if r.transcript is not null then return jsonb_build_object('text',r.transcript); end if;
 if exists(select 1 from private.transcription_requests where user_id=auth.uid() and expires_at>now()) then return jsonb_build_object('error','A transcription is already running. Wait a minute before retrying.'); end if;
 if (select coalesce(sum(attempts),0) from private.transcription_requests where user_id=auth.uid() and created_at>now()-interval '1 hour')>=10 or (select coalesce(sum(attempts),0) from private.transcription_requests where user_id=auth.uid())>=30 then return jsonb_build_object('error','Transcription limit reached (10 per hour, 30 per day). Type notes or retry later.'); end if;
 insert into private.transcription_requests(user_id,id,visit_id,digest,lease,expires_at) values(auth.uid(),p_id,p_visit,p_digest,token,now()+interval '90 seconds') on conflict(user_id,id) do update set attempts=private.transcription_requests.attempts+1,created_at=now(),lease=token,expires_at=now()+interval '90 seconds';
 return jsonb_build_object('lease',token); end $$;
create function public.finish_transcription(p_id uuid,p_lease uuid,p_text text default null) returns void language sql security definer set search_path='' as $$
 update private.transcription_requests set transcript=p_text,expires_at=null,lease=null where user_id=auth.uid() and id=p_id and lease=p_lease;
$$;
revoke all on function public.begin_transcription(uuid,uuid,text),public.finish_transcription(uuid,uuid,text) from public,anon;
grant execute on function public.begin_transcription(uuid,uuid,text),public.finish_transcription(uuid,uuid,text) to authenticated;
