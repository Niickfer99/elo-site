-- Elo database — execute in Supabase SQL Editor as project owner.
create extension if not exists pgcrypto;
create table public.members (
 id uuid primary key references auth.users(id) on delete cascade,
 display_name text not null check (length(trim(display_name)) between 2 and 80),
 birth_date date not null,
 state char(2) not null,
 city text not null,
 height_cm integer not null check(height_cm between 100 and 250),
 whatsapp text not null check(whatsapp ~ '^\+[1-9][0-9]{9,14}$'),
 church text not null, denomination text not null, ministry text not null,
 faith_time text not null, favorite_verse text not null,
 hobbies text not null, bio text not null default '',
 personality text[] not null, wanted_traits text[] not null,
 relationship_goal text not null check(relationship_goal in ('serious','marriage','friendship')),
 min_age integer not null check(min_age>=18), max_age integer not null check(max_age>=min_age),
 location_preference text not null check(location_preference in ('city','state','all')),
 height_preference text not null check(height_preference in ('any','taller','shorter','similar')),
 photo_path text not null,
 status text not null default 'pending' check(status in ('pending','approved','suspended')),
 is_admin boolean not null default false,
 created_at timestamptz not null default now(),
 constraint adult_only check(birth_date <= (current_date - interval '18 years')::date),
 constraint personality_valid check(cardinality(personality) between 1 and 6 and cardinality(wanted_traits)>=1),
 constraint profile_text_valid check(length(trim(city))>0 and length(trim(church))>0 and length(trim(denomination))>0 and length(trim(ministry))>0 and length(trim(faith_time))>0 and length(trim(favorite_verse))>0 and length(trim(hobbies))>0)
);
create table public.invites (
 id uuid primary key default gen_random_uuid(),
 code_hash text not null unique,
 created_by uuid references auth.users(id),
 expires_at timestamptz not null,
 used_by uuid unique references auth.users(id),
 used_at timestamptz,
 created_at timestamptz not null default now()
);
create table public.interests (
 sender uuid not null references public.members(id) on delete cascade,
 recipient uuid not null references public.members(id) on delete cascade,
 status text not null default 'pending' check(status in ('pending','accepted','declined')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 primary key(sender,recipient),
 check(sender<>recipient)
);
create table public.blocks (
 blocker uuid not null references public.members(id) on delete cascade,
 blocked uuid not null references public.members(id) on delete cascade,
 primary key(blocker,blocked), check(blocker<>blocked)
);
create table public.reports (
 id uuid primary key default gen_random_uuid(),
 reporter uuid not null references public.members(id),
 reported uuid not null references public.members(id),
 reason text not null check(length(trim(reason)) between 5 and 1000),
 created_at timestamptz default now()
);
create index interests_recipient_idx on public.interests(recipient);
create index members_status_idx on public.members(status);
-- No table-wide grants: access only through narrowly scoped server-side RPCs.
alter table public.members enable row level security;
alter table public.invites enable row level security;
alter table public.interests enable row level security;
alter table public.blocks enable row level security;
alter table public.reports enable row level security;
revoke all on public.members,public.invites,public.interests,public.blocks,public.reports from anon,authenticated;
-- Helper functions always use auth.uid(); never accept a caller identity as trusted.
create or replace function public.is_approved() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.members m where m.id=(select auth.uid()) and m.status='approved');
$$;
create or replace function public.is_admin() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.members m where m.id=(select auth.uid()) and m.status='approved' and m.is_admin);
$$;
create or replace function public.my_profile() returns jsonb language sql stable security definer set search_path='' as $$
 select to_jsonb(m) from public.members m where m.id=(select auth.uid());
$$;
create or replace function public.redeem_invite(p_code text, p_profile jsonb) returns text
language plpgsql security definer set search_path='' as $$
declare v_id uuid := auth.uid(); v_invite uuid; v_birth date; v_photo text;
begin
 if v_id is null then raise exception 'Faça login primeiro'; end if;
 if exists(select 1 from public.members where id=v_id) then raise exception 'Cadastro já existe'; end if;
 if length(coalesce(p_code,''))<12 then raise exception 'Convite inválido'; end if;
 select id into v_invite from public.invites where code_hash=encode(extensions.digest(p_code,'sha256'),'hex') and used_by is null and expires_at>now() for update;
 if v_invite is null then raise exception 'Convite inválido, usado ou expirado'; end if;
 v_birth:=(p_profile->>'birth_date')::date;
 if v_birth > (current_date - interval '18 years')::date then raise exception 'Cadastro exclusivo para maiores de 18 anos'; end if;
 v_photo:=p_profile->>'photo_path';
 if v_photo is null or v_photo not like v_id::text||'/%' then raise exception 'Foto inválida'; end if;
 insert into public.members(id,display_name,birth_date,state,city,height_cm,whatsapp,church,denomination,ministry,faith_time,favorite_verse,hobbies,bio,personality,wanted_traits,relationship_goal,min_age,max_age,location_preference,height_preference,photo_path)
 values(v_id,p_profile->>'display_name',v_birth,p_profile->>'state',p_profile->>'city',(p_profile->>'height_cm')::integer,p_profile->>'whatsapp',p_profile->>'church',p_profile->>'denomination',p_profile->>'ministry',p_profile->>'faith_time',p_profile->>'favorite_verse',p_profile->>'hobbies',coalesce(p_profile->>'bio',''),array(select jsonb_array_elements_text(p_profile->'personality')),array(select jsonb_array_elements_text(p_profile->'wanted_traits')),p_profile->>'relationship_goal',(p_profile->>'min_age')::integer,(p_profile->>'max_age')::integer,p_profile->>'location_preference',p_profile->>'height_preference',v_photo);
 update public.invites set used_by=v_id,used_at=now() where id=v_invite;
 return 'pending';
end $$;
create or replace function public.directory() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'name',m.display_name,'age',date_part('year',age(current_date,m.birth_date))::integer,'state',m.state,'city',m.city,'height_cm',m.height_cm,'church',m.church,'denomination',m.denomination,'ministry',m.ministry,'faith_time',m.faith_time,'verse',m.favorite_verse,'hobbies',m.hobbies,'bio',m.bio,'personality',m.personality,'wanted_traits',m.wanted_traits,'goal',m.relationship_goal,'min_age',m.min_age,'max_age',m.max_age,'location',m.location_preference,'heightpref',m.height_preference,'photo_path',m.photo_path)), '[]'::jsonb)
 from public.members m where public.is_approved() and m.status='approved' and m.id<>auth.uid()
 and not exists(select 1 from public.blocks b where (b.blocker=auth.uid() and b.blocked=m.id) or (b.blocked=auth.uid() and b.blocker=m.id));
$$;
create or replace function public.send_interest(p_recipient uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.is_approved() or p_recipient=auth.uid() or not exists(select 1 from public.members where id=p_recipient and status='approved') then raise exception 'Solicitação não permitida'; end if;
 if exists(select 1 from public.blocks where (blocker=auth.uid() and blocked=p_recipient) or (blocked=auth.uid() and blocker=p_recipient)) then raise exception 'Solicitação não permitida'; end if;
 insert into public.interests(sender,recipient) values(auth.uid(),p_recipient) on conflict(sender,recipient) do update set status='pending',updated_at=now();
end $$;
create or replace function public.my_interests() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('sender',i.sender,'recipient',i.recipient,'status',i.status,'created_at',i.created_at,'name',m.display_name)), '[]'::jsonb)
 from public.interests i join public.members m on m.id=case when i.sender=auth.uid() then i.recipient else i.sender end
 where public.is_approved() and (i.sender=auth.uid() or i.recipient=auth.uid()) and m.status='approved'
 and not exists(select 1 from public.blocks b where (b.blocker=auth.uid() and b.blocked=m.id) or (b.blocked=auth.uid() and b.blocker=m.id));
$$;
create or replace function public.respond_interest(p_sender uuid,p_accept boolean) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.is_approved() then raise exception 'Acesso não autorizado'; end if;
 update public.interests set status=case when p_accept then 'accepted' else 'declined' end,updated_at=now()
 where sender=p_sender and recipient=auth.uid() and status='pending';
 if not found then raise exception 'Solicitação não encontrada'; end if;
end $$;
create or replace function public.cancel_interest(p_recipient uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 delete from public.interests where sender=auth.uid() and recipient=p_recipient;
end $$;
create or replace function public.connection_phone(p_other uuid) returns text language plpgsql stable security definer set search_path='' as $$
declare v_phone text;
begin
 if not public.is_approved() then raise exception 'Acesso não autorizado'; end if;
 if exists(select 1 from public.blocks where (blocker=auth.uid() and blocked=p_other) or (blocked=auth.uid() and blocker=p_other)) then raise exception 'Contato indisponível'; end if;
 select m.whatsapp into v_phone from public.members m where m.id=p_other and m.status='approved' and exists(select 1 from public.interests i where i.status='accepted' and ((i.sender=auth.uid() and i.recipient=p_other) or (i.recipient=auth.uid() and i.sender=p_other)));
 if v_phone is null then raise exception 'Contato não liberado'; end if;
 return v_phone;
end $$;
create or replace function public.block_member(p_other uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.is_approved() or p_other=auth.uid() then raise exception 'Ação não permitida'; end if;
 insert into public.blocks(blocker,blocked) values(auth.uid(),p_other) on conflict do nothing;
 delete from public.interests where (sender=auth.uid() and recipient=p_other) or (sender=p_other and recipient=auth.uid());
end $$;
create or replace function public.report_member(p_other uuid,p_reason text) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.is_approved() or p_other=auth.uid() then raise exception 'Ação não permitida'; end if;
 insert into public.reports(reporter,reported,reason) values(auth.uid(),p_other,p_reason);
end $$;
create or replace function public.admin_queue() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'name',m.display_name,'status',m.status,'created_at',m.created_at)), '[]'::jsonb) from public.members m where public.is_admin() and m.status='pending';
$$;
create or replace function public.admin_approve(p_member uuid,p_approve boolean) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.is_admin() then raise exception 'Acesso negado'; end if;
 update public.members set status=case when p_approve then 'approved' else 'suspended' end where id=p_member and status='pending';
end $$;
create or replace function public.admin_invite(p_days integer default 14) returns text language plpgsql security definer set search_path='' as $$
declare v_code text;
begin
 if not public.is_admin() then raise exception 'Acesso negado'; end if;
 if p_days<1 or p_days>90 then raise exception 'Validade inválida'; end if;
 v_code:=encode(extensions.gen_random_bytes(24),'hex');
 insert into public.invites(code_hash,created_by,expires_at) values(encode(extensions.digest(v_code,'sha256'),'hex'),auth.uid(),now()+make_interval(days=>p_days));
 return v_code;
end $$;
create or replace function public.delete_my_account() returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Não autenticado'; end if;
 -- Auth identity deletion requires a separate privileged workflow. Profile and requests removed here.
 delete from public.members where id=auth.uid();
end $$;
-- Limit execute access explicitly.
revoke all on function public.is_approved(),public.is_admin(),public.my_profile(),public.redeem_invite(text,jsonb),public.directory(),public.send_interest(uuid),public.my_interests(),public.respond_interest(uuid,boolean),public.cancel_interest(uuid),public.connection_phone(uuid),public.block_member(uuid),public.report_member(uuid,text),public.admin_queue(),public.admin_approve(uuid,boolean),public.admin_invite(integer),public.delete_my_account() from public,anon;
grant execute on function public.is_approved(),public.is_admin(),public.my_profile(),public.redeem_invite(text,jsonb),public.directory(),public.send_interest(uuid),public.my_interests(),public.respond_interest(uuid,boolean),public.cancel_interest(uuid),public.connection_phone(uuid),public.block_member(uuid),public.report_member(uuid,text),public.admin_queue(),public.admin_approve(uuid,boolean),public.admin_invite(integer),public.delete_my_account() to authenticated;
-- Private profile photos; only owner can upload, only approved members can read.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('elo-photos','elo-photos',false,5242880,array['image/jpeg','image/png','image/webp']) on conflict(id) do nothing;
create policy "owner upload photos" on storage.objects for insert to authenticated with check(bucket_id='elo-photos' and (storage.foldername(name))[1]=auth.uid()::text);
create policy "owner update photos" on storage.objects for update to authenticated using(bucket_id='elo-photos' and (storage.foldername(name))[1]=auth.uid()::text) with check(bucket_id='elo-photos' and (storage.foldername(name))[1]=auth.uid()::text);
create policy "members read photos" on storage.objects for select to authenticated using(bucket_id='elo-photos' and (public.is_approved() or (storage.foldername(name))[1]=auth.uid()::text));
create policy "owner delete photos" on storage.objects for delete to authenticated using(bucket_id='elo-photos' and (storage.foldername(name))[1]=auth.uid()::text);
-- Bootstrap admin AFTER a trusted adult creates an account and redeems the first invite.
-- For first invite, run as project owner in SQL editor (replace code):
-- insert into public.invites(code_hash,expires_at) values(encode(extensions.digest('PASTE-A-LONG-RANDOM-FIRST-CODE','sha256'),'hex'),now()+interval '7 days');
-- After first profile exists, replace UUID with its ID:
-- update public.members set status='approved',is_admin=true where id='UUID-OF-FIRST-ADMIN';
