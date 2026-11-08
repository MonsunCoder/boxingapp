-- Dry-run proof for Change 2. Run as ONE script:
-- begin; <Change 1 migration>; <Change 2 migration>; <this file>; rollback;
-- Nothing persists. Every row returned must say PASS.
create temp table _r(step text, result text, at timestamptz default clock_timestamp()) on commit drop;
create temp table _ids(k text primary key, id uuid) on commit drop;
grant all on _r, _ids to authenticated;
create function pg_temp.t(p_step text, p_sql text, p_refused boolean) returns void language plpgsql as $f$
begin
  begin
    execute p_sql;
    insert into _r(step,result) values (p_step, case when p_refused then 'FAIL: not refused' else 'PASS: ran' end);
  exception when others then
    if p_refused then insert into _r(step,result) values (p_step, 'PASS: refused ('||sqlerrm||')');
    else insert into _r(step,result) values (p_step, 'FAIL: '||sqlerrm); end if;
  end;
end $f$;
create function pg_temp.ok(p_step text, p_pass boolean, p_detail text) returns void language sql as $f$
  insert into _r(step,result) values (p_step, case when p_pass then 'PASS: ' else 'FAIL: ' end || coalesce(p_detail,''));
$f$;
grant execute on function pg_temp.t(text,text,boolean), pg_temp.ok(text,boolean,text) to authenticated;

-- Three brand-new accounts that exist only inside this transaction.
insert into _ids values ('u10', gen_random_uuid()), ('u13', gen_random_uuid()), ('u12', gen_random_uuid());
insert into auth.users (id, email, aud, role) select id, k||'@dryrun.test', 'authenticated', 'authenticated' from _ids;

-- The kid test account (rolled back).
select set_config('request.jwt.claims','{"sub":"f804086d-cd89-4ef4-b7f3-c1c95df5e450","role":"authenticated"}',true);
set local role authenticated;
do $d$
declare kid uuid := auth.uid(); j jsonb; p record; v_topic uuid;
begin
  perform pg_temp.t('kid: direct write of dob', format($q$update public.profiles set dob='2000-01-01' where id=%L$q$, kid), true);
  perform pg_temp.t('kid: direct write of is_minor', format($q$update public.profiles set is_minor=false where id=%L$q$, kid), true);
  perform pg_temp.t('kid: direct write of consent_status', format($q$update public.profiles set consent_status='granted' where id=%L$q$, kid), true);
  perform pg_temp.t('kid: direct write of role', format($q$update public.profiles set role='admin' where id=%L$q$, kid), true);
  perform pg_temp.t('kid: direct insert of a profile', $q$insert into public.profiles(id) values (gen_random_uuid())$q$, true);
  perform pg_temp.t('kid: insert a consent row marked granted', format($q$insert into public.parental_consents(child_id,parent_email,token,status) values (%L,'a@b.co','tok','granted')$q$, kid), true);
  perform pg_temp.t('kid: update a consent row', $q$update public.parental_consents set status='granted'$q$, true);
  perform pg_temp.t('kid: timezone still saves', format($q$update public.profiles set timezone=timezone where id=%L$q$, kid), false);
  perform pg_temp.t('kid: goals still save', format($q$update public.profiles set goals=goals where id=%L$q$, kid), false);
  perform pg_temp.t('kid: words-first opt-in still saves', format($q$update public.profiles set words_first_optin=words_first_optin where id=%L$q$, kid), false);
  perform pg_temp.t('kid: onboarding flag still saves', format($q$update public.profiles set onboarding_complete=onboarding_complete where id=%L$q$, kid), false);
  j := public.update_my_profile('Sulvan', '{"emoji":"🐉"}'::jsonb);
  perform pg_temp.ok('kid: fight name and avatar still save', (j->>'ok')='true', j::text);
  j := public.set_birth_date('2000-01-01');
  perform pg_temp.ok('kid: birth date cannot change', j->>'reason'='already_set', j::text);
  j := public.request_parental_consent('parent@example.com');
  perform pg_temp.ok('kid: granted account cannot re-request', j->>'reason'='wrong_state', j::text);
  j := public.restart_consent();
  perform pg_temp.ok('kid: granted account cannot restart', j->>'reason'='wrong_state', j::text);
  select consent_status, is_minor, dob is not null as has_dob into p from public.profiles where id=kid;
  perform pg_temp.ok('kid: account unchanged and valid', p.consent_status='granted' and p.is_minor and p.has_dob, row_to_json(p)::text);
  perform pg_temp.ok('kid: can still post', public.can_post(kid), null);
  select id into v_topic from public.forum_topics where title='TEAM';
  j := public.create_post(v_topic,'Clean title','Clean body here');
  perform pg_temp.ok('kid: create_post still works', (j->>'held')='false', 'held='||(j->>'held'));
end $d$;

-- A new under-13 from sign-up to granted.
select set_config('request.jwt.claims', json_build_object('sub',(select id::text from _ids where k='u10'),'role','authenticated')::text, true);
do $d$
declare u uuid := auth.uid(); j jsonb; t text; s text; n int; v_topic uuid;
begin
  select id into v_topic from public.forum_topics where title='TEAM';
  perform pg_temp.ok('new: cannot post before the age gate', not public.can_post(u), null);
  j := public.set_birth_date(current_date + 1);
  perform pg_temp.ok('new: future date refused', j->>'reason'='bad_date', j::text);
  j := public.set_birth_date((current_date - interval '101 years')::date);
  perform pg_temp.ok('new: date over 100 years back refused', j->>'reason'='bad_date', j::text);
  j := public.set_birth_date((current_date - interval '10 years')::date);
  perform pg_temp.ok('new: 10-year-old saved, server says under 13', (j->>'ok')='true' and (j->>'is_minor')='true', j::text);
  j := public.set_birth_date('2000-01-01');
  perform pg_temp.ok('new: second birth date refused', j->>'reason'='already_set', j::text);
  perform pg_temp.ok('new: under-13 without consent cannot post', not public.can_post(u), null);
  perform pg_temp.t('new: create_post refused', format($q$select public.create_post(%L,'x','hello there')$q$, v_topic), true);
  perform pg_temp.t('new: cannot grant own consent', format($q$update public.profiles set consent_status='granted' where id=%L$q$, u), true);
  j := public.request_parental_consent('not an email');
  perform pg_temp.ok('new: bad email refused', j->>'reason'='bad_email', j::text);
  j := public.request_parental_consent('Parent@Example.com');
  select consent_status into s from public.profiles where id=u;
  select token into t from public.parental_consents where child_id=u;
  perform pg_temp.ok('new: request saved, pending, 48-character server token', (j->>'ok')='true' and s='pending' and char_length(t)=48, 'status='||s||' token length='||char_length(t));
  perform pg_temp.ok('new: pending still cannot post', not public.can_post(u), null);
  j := public.request_parental_consent('parent@example.com');
  perform pg_temp.ok('new: no second request while pending', j->>'reason'='wrong_state', j::text);
  j := public.restart_consent();
  select consent_status into s from public.profiles where id=u;
  perform pg_temp.ok('new: restart returns to Ask a parent', (j->>'ok')='true' and s='not_required', j::text);
  j := public.restart_consent();
  perform pg_temp.ok('new: restart refused when not pending', j->>'reason'='wrong_state', j::text);
  perform pg_temp.ok('new: restart does not open posting', not public.can_post(u), null);
  j := public.request_parental_consent('two@example.com');
  perform public.restart_consent();
  j := public.request_parental_consent('three@example.com');
  perform pg_temp.ok('new: third request of the day allowed', (j->>'ok')='true', j::text);
  perform public.restart_consent();
  j := public.request_parental_consent('four@example.com');
  select count(*) into n from public.parental_consents where child_id=u;
  perform pg_temp.ok('new: fourth request of the day refused', j->>'reason'='too_many' and n=3, j::text||' rows='||n);
end $d$;

-- Age boundary: exactly 13 today is not under 13; 13 tomorrow still is.
select set_config('request.jwt.claims', json_build_object('sub',(select id::text from _ids where k='u13'),'role','authenticated')::text, true);
do $d$
declare j jsonb;
begin
  j := public.set_birth_date((current_date - interval '13 years')::date);
  perform pg_temp.ok('13 today: not under 13', (j->>'is_minor')='false', j::text);
  perform pg_temp.ok('13 today: can post', public.can_post(auth.uid()), null);
  j := public.request_parental_consent('parent@example.com');
  perform pg_temp.ok('13 today: no parent request needed', j->>'reason'='not_under_13', j::text);
end $d$;
select set_config('request.jwt.claims', json_build_object('sub',(select id::text from _ids where k='u12'),'role','authenticated')::text, true);
do $d$
declare j jsonb;
begin
  j := public.set_birth_date(((current_date - interval '13 years')::date + 1));
  perform pg_temp.ok('13 tomorrow: still under 13', (j->>'is_minor')='true', j::text);
end $d$;
reset role;

-- A coach grants from the SQL editor; then the child can post.
update public.profiles set consent_status='granted' where id=(select id from _ids where k='u10');
select set_config('request.jwt.claims', json_build_object('sub',(select id::text from _ids where k='u10'),'role','authenticated')::text, true);
set local role authenticated;
do $d$ begin perform pg_temp.ok('new: can post once granted', public.can_post(auth.uid()), null); end $d$;
reset role;

-- Permissions.
do $d$
declare f text; v text;
begin
  perform pg_temp.ok('no update on dob, is_minor, consent_status or role',
    not (has_column_privilege('authenticated','public.profiles','dob','update') or has_column_privilege('authenticated','public.profiles','is_minor','update')
      or has_column_privilege('authenticated','public.profiles','consent_status','update') or has_column_privilege('authenticated','public.profiles','role','update')
      or has_column_privilege('anon','public.profiles','dob','update') or has_table_privilege('authenticated','public.profiles','insert')), null);
  perform pg_temp.ok('update kept on the six allowed columns',
    has_column_privilege('authenticated','public.profiles','display_name','update') and has_column_privilege('authenticated','public.profiles','avatar_config','update')
    and has_column_privilege('authenticated','public.profiles','goals','update') and has_column_privilege('authenticated','public.profiles','words_first_optin','update')
    and has_column_privilege('authenticated','public.profiles','onboarding_complete','update') and has_column_privilege('authenticated','public.profiles','timezone','update'), null);
  perform pg_temp.ok('no insert or update on parental_consents; read kept',
    not has_table_privilege('authenticated','public.parental_consents','insert') and not has_table_privilege('authenticated','public.parental_consents','update')
    and has_table_privilege('authenticated','public.parental_consents','select'), null);
  foreach f in array array['public.set_birth_date(date)','public.request_parental_consent(text)','public.restart_consent()'] loop
    select prosecdef::text||' '||array_to_string(proconfig,',') into v from pg_proc where oid=f::regprocedure;
    perform pg_temp.ok(f||': definer, pinned, anon refused, app and service allowed',
      v like 'true search_path=%' and not has_function_privilege('anon',f,'execute') and has_function_privilege('authenticated',f,'execute') and has_function_privilege('service_role',f,'execute'), v);
  end loop;
end $d$;
select step, result from _r order by at;
