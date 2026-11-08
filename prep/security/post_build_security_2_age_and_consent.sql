-- post_build_security_2_age_and_consent
-- Sunday_Security_Fix_Plan.md, Change 2 (High 2). Apply after Change 1, only when
-- the same-day phone re-check is possible (late rule). The app edits on this
-- branch (age gate, consent, waiting screens) must merge at the same time: the
-- old screens write these columns directly and will be refused.

-- 1. Profiles: signed-in accounts may only update these six columns.
--    Birth date, under-13 flag, consent status and role become server-only.
revoke insert, update on public.profiles from anon, authenticated;
grant update (display_name, avatar_config, goals, words_first_optin, onboarding_complete, timezone)
  on public.profiles to authenticated;

-- 2. Consent rows: kids keep reading their own, and can no longer write them.
drop policy if exists p_consents_insert on public.parental_consents;
revoke insert, update on public.parental_consents from anon, authenticated;

-- 3. Birth date: once only. The server works out the under-13 flag.
create or replace function public.set_birth_date(p_dob date)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_minor boolean;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if p_dob is null or p_dob > current_date or p_dob < (current_date - interval '100 years')::date then
    return jsonb_build_object('ok', false, 'reason', 'bad_date');
  end if;
  update profiles
     set dob = p_dob,
         is_minor = p_dob > (current_date - interval '13 years')::date
   where id = auth.uid() and dob is null
  returning is_minor into v_minor;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'already_set');
  end if;
  return jsonb_build_object('ok', true, 'is_minor', v_minor);
end $function$;
revoke all on function public.set_birth_date(date) from public, anon;
grant execute on function public.set_birth_date(date) to authenticated, service_role;

-- 4. Asking a parent: under-13s only, server-made token, at most 3 requests a day.
create or replace function public.request_parental_consent(p_parent_email text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_email text := lower(trim(coalesce(p_parent_email, '')));
  v_minor boolean;
  v_status text;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  select is_minor, consent_status into v_minor, v_status from profiles where id = v_uid for update;
  if not found or not v_minor then
    return jsonb_build_object('ok', false, 'reason', 'not_under_13');
  end if;
  if v_status <> 'not_required' then
    return jsonb_build_object('ok', false, 'reason', 'wrong_state');
  end if;
  if char_length(v_email) > 254 or v_email !~ '^\S+@\S+\.\S+$' then
    return jsonb_build_object('ok', false, 'reason', 'bad_email');
  end if;
  if (select count(*) from parental_consents
       where child_id = v_uid and created_at > now() - interval '1 day') >= 3 then
    return jsonb_build_object('ok', false, 'reason', 'too_many');
  end if;
  insert into parental_consents (child_id, parent_email, token, status)
  values (v_uid, v_email, encode(extensions.gen_random_bytes(24), 'hex'), 'pending');
  update profiles set consent_status = 'pending' where id = v_uid;
  return jsonb_build_object('ok', true);
end $function$;
revoke all on function public.request_parental_consent(text) from public, anon;
grant execute on function public.request_parental_consent(text) to authenticated, service_role;

-- 5. "Use a different parent email": only from pending.
create or replace function public.restart_consent()
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  update profiles set consent_status = 'not_required'
   where id = auth.uid() and is_minor and consent_status = 'pending';
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'wrong_state');
  end if;
  return jsonb_build_object('ok', true);
end $function$;
revoke all on function public.restart_consent() from public, anon;
grant execute on function public.restart_consent() to authenticated, service_role;

-- 6. Posting: under-13s need granted consent; nobody posts before the age gate.
create or replace function public.can_post(p_user uuid)
 returns boolean
 language sql
 stable
 set search_path to 'public'
as $function$
  select exists (select 1 from profiles
    where id = p_user
      and (consent_status = 'granted'
           or (consent_status = 'not_required' and not is_minor and dob is not null)))
    and not connect_banned(p_user);
$function$;
