-- Dry-run proof for Change 1. Run as ONE script: begin; <the migration>; <this file>; rollback;
-- Nothing persists. Read the returned table: every row must say PASS.
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

-- Acting as the kid (rolled back).
select set_config('request.jwt.claims','{"sub":"f804086d-cd89-4ef4-b7f3-c1c95df5e450","role":"authenticated"}',true);
set local role authenticated;
do $d$
declare kid uuid := auth.uid(); v_topic uuid; j jsonb; v_clean uuid; v_held uuid; v_st text; n int;
begin
  select id into v_topic from public.forum_topics where title='TEAM';
  perform pg_temp.t('kid: direct insert into forum_posts', format($q$insert into public.forum_posts(topic_id,author_id,title,body) values (%L,%L,'x','this is shit')$q$, v_topic, kid), true);

  j := public.create_post(v_topic,'Clean title','Clean body here');
  v_clean := (j->>'id')::uuid; insert into _ids values ('clean', v_clean);
  select status into v_st from public.forum_posts where id=v_clean;
  perform pg_temp.ok('kid: create_post clean goes up', (j->>'held')='false' and v_st='visible', j::text||' status='||v_st);

  j := public.create_post(v_topic,'x','this is shit');
  v_held := (j->>'id')::uuid; insert into _ids values ('held_post', v_held);
  select status into v_st from public.forum_posts where id=v_held;
  perform pg_temp.ok('kid: create_post still holds blocked words', (j->>'held')='true' and v_st='pending_review', 'held='||(j->>'held')||' status='||v_st);

  perform pg_temp.t('kid: direct un-hide of own held post', format($q$update public.forum_posts set status='visible' where id=%L$q$, v_held), true);
  perform pg_temp.t('kid: direct edit of own visible post', format($q$update public.forum_posts set body='edited' where id=%L$q$, v_clean), true);
  perform pg_temp.t('kid: direct insert into forum_replies', format($q$insert into public.forum_replies(post_id,author_id,body) values (%L,%L,'this is shit')$q$, v_clean, kid), true);
  perform pg_temp.t('kid: direct insert into forum_comments', format($q$insert into public.forum_comments(post_id,author_id,body) values (%L,%L,'this is shit')$q$, v_clean, kid), true);

  j := public.create_reply(v_clean,'Good work');
  perform pg_temp.ok('kid: create_reply clean goes up', (j->>'held')='false', j::text);
  insert into _ids values ('clean_reply', (j->>'id')::uuid);
  perform pg_temp.t('kid: direct update of own reply', format($q$update public.forum_replies set body='edited' where id=%L$q$, (j->>'id')), true);

  j := public.create_reply(v_clean,'this is shit');
  perform pg_temp.ok('kid: create_reply still holds blocked words', (j->>'held')='true', 'held='||(j->>'held'));
  insert into _ids values ('held_reply', (j->>'id')::uuid);

  perform pg_temp.t('kid: read profiles directly (no loop)', 'select count(*) from public.profiles', false);
  select count(*) into n from public.profiles;
  perform pg_temp.ok('kid: sees only own profile', n=1, 'rows='||n);
  perform pg_temp.t('kid: read forum_posts directly', 'select count(*) from public.forum_posts', false);
  perform pg_temp.t('kid: read forum_replies directly', 'select count(*) from public.forum_replies', false);
  perform pg_temp.t('kid: read reports directly', 'select count(*) from public.reports', false);
  perform pg_temp.t('kid: read conduct_offenses directly', 'select count(*) from public.conduct_offenses', false);
  perform pg_temp.t('kid: read connect_appeals directly', 'select count(*) from public.connect_appeals', false);
  perform pg_temp.t('kid: read parental_consents directly', 'select count(*) from public.parental_consents', false);
  perform pg_temp.t('kid: read coach_messages directly', 'select count(*) from public.coach_messages', false);
  perform pg_temp.t('kid: read effort_reports directly', 'select count(*) from public.effort_reports', false);
  perform pg_temp.ok('kid: is_staff is false', not public.is_staff(), null);
  perform pg_temp.t('kid: cannot run moderate_content', format($q$select public.moderate_content('post',%L,'approve')$q$, v_held), true);
end $d$;

-- Acting as the admin (rolled back).
select set_config('request.jwt.claims','{"sub":"cf24642c-60e1-459d-b921-a65e2483dca0","role":"authenticated"}',true);
do $d$
declare j jsonb; n int; v_held uuid; v_reply uuid;
begin
  select id into v_held from _ids where k='held_post';
  select id into v_reply from _ids where k='held_reply';
  perform pg_temp.ok('admin: is_staff is true', public.is_staff(), null);
  select count(*) into n from public.profiles;
  perform pg_temp.ok('admin: reads every profile, no loop', n=2, 'rows='||n);
  j := public.moderation_queue();
  perform pg_temp.ok('admin: Coach''s Queue lists both held items', jsonb_typeof(j)='array' and jsonb_array_length(j)=2, 'items='||jsonb_array_length(j));
  perform pg_temp.t('admin: direct update refused too', format($q$update public.forum_posts set status='visible' where id=%L$q$, v_held), true);
  j := public.moderate_content('post', v_held, 'remove');
  perform pg_temp.ok('admin: remove the held post', (j->>'ok')='true', j::text);
  j := public.moderate_content('comment', v_reply, 'approve');
  perform pg_temp.ok('admin: approve the held reply', (j->>'ok')='true', j::text);
  j := public.moderation_queue();
  perform pg_temp.ok('admin: queue is empty afterwards', jsonb_array_length(j)=0, 'items='||jsonb_array_length(j));
end $d$;

-- Back to the kid: the removal notice is dated by the removal.
select set_config('request.jwt.claims','{"sub":"f804086d-cd89-4ef4-b7f3-c1c95df5e450","role":"authenticated"}',true);
do $d$
declare j jsonb; e jsonb; v_when timestamptz; v_created timestamptz;
begin
  j := public.activity_page(10);
  select x into e from jsonb_array_elements(j) x where x->>'body' like 'Your post was removed%' limit 1;
  select removed_at, created_at into v_when, v_created from public.forum_posts where id=(select id from _ids where k='held_post');
  perform pg_temp.ok('kid: removed notice uses the removal time', e is not null and (e->>'created_at')::timestamptz = v_when and v_when > v_created, 'notice='||(e->>'created_at')||' posted='||v_created);
end $d$;
reset role;

-- As the owner: state and permissions.
do $d$
declare v text; c int;
begin
  select status||' removed_at set='||(removed_at is not null) into v from public.forum_posts where id=(select id from _ids where k='held_post');
  perform pg_temp.ok('held post ended hidden with a removal time', v='hidden removed_at set=true', v);
  select status||' removed_at set='||(removed_at is not null) into v from public.forum_replies where id=(select id from _ids where k='held_reply');
  perform pg_temp.ok('approved reply ended visible, no removal time', v='visible removed_at set=false', v);
  select count(*) into c from public.conduct_offenses where target_id=(select id from _ids where k='held_reply') and status='cleared';
  perform pg_temp.ok('approve cleared the reply''s offense', c=1, 'cleared='||c);
  perform pg_temp.ok('no insert or update left on forum tables',
    not (has_table_privilege('authenticated','public.forum_posts','insert') or has_table_privilege('authenticated','public.forum_posts','update')
      or has_table_privilege('anon','public.forum_posts','insert') or has_table_privilege('anon','public.forum_posts','update')
      or has_table_privilege('authenticated','public.forum_replies','insert') or has_table_privilege('authenticated','public.forum_replies','update')
      or has_table_privilege('anon','public.forum_replies','insert') or has_table_privilege('anon','public.forum_replies','update')
      or has_table_privilege('authenticated','public.forum_comments','insert') or has_table_privilege('authenticated','public.forum_comments','update')
      or has_table_privilege('anon','public.forum_comments','insert') or has_table_privilege('anon','public.forum_comments','update')), null);
  perform pg_temp.ok('reading the forum tables is still granted', has_table_privilege('authenticated','public.forum_posts','select') and has_table_privilege('authenticated','public.forum_replies','select'), null);
  select count(*) into c from pg_policies where schemaname='public' and tablename in ('forum_posts','forum_replies','forum_comments') and cmd in ('INSERT','UPDATE');
  perform pg_temp.ok('no insert or update rules remain', c=0, 'rules='||c);
  select prosecdef::text||' '||array_to_string(proconfig,',') into v from pg_proc where oid='public.is_staff()'::regprocedure;
  perform pg_temp.ok('is_staff is security definer, search_path pinned', v like 'true search_path=%', v);
  perform pg_temp.ok('is_staff execute: not anon, yes authenticated and service_role',
    not has_function_privilege('anon','public.is_staff()','execute') and has_function_privilege('authenticated','public.is_staff()','execute') and has_function_privilege('service_role','public.is_staff()','execute'), null);
end $d$;
select step, result from _r order by at;
