-- post_build_security_1_forum_writes
-- Sunday_Security_Fix_Plan.md, Change 1 (High 1 and 1b), plus weekend broken item 6.
-- Apply with apply_migration under this name, only after the same-day phone
-- re-check is possible (late rule). The app change on this branch (ladder.tsx)
-- must merge at the same time: the old belt share inserts directly and will be refused.

-- 1. is_staff() becomes a security-definer function (approved by Jigar, Nov 7).
--    It read profiles, whose read rule calls is_staff(), so it looped forever.
create or replace function public.is_staff()
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select exists (select 1 from profiles
    where id = auth.uid() and role in ('admin','moderator'));
$function$;
revoke all on function public.is_staff() from public, anon;
grant execute on function public.is_staff() to authenticated, service_role;

-- 2. Forum writes only through server functions. Reading is unchanged.
drop policy if exists p_posts_insert on public.forum_posts;
drop policy if exists p_posts_moderate on public.forum_posts;
drop policy if exists p_replies_insert on public.forum_replies;
drop policy if exists p_comments_insert on public.forum_comments;
drop policy if exists p_comments_moderate on public.forum_comments;
revoke insert, update on public.forum_posts from anon, authenticated;
revoke insert, update on public.forum_replies from anon, authenticated;
revoke insert, update on public.forum_comments from anon, authenticated;

-- 3. Weekend broken item 6: remember when a coach removed something.
alter table public.forum_posts add column if not exists removed_at timestamptz;
alter table public.forum_replies add column if not exists removed_at timestamptz;

create or replace function public.moderate_content(p_type text, p_id uuid, p_action text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if not is_mod(auth.uid()) then raise exception 'not a moderator'; end if;
  if p_action not in ('approve','remove') then raise exception 'bad action'; end if;
  if p_type = 'post' then
    update forum_posts set status = case when p_action='approve' then 'visible' else 'hidden' end,
      removed_at = case when p_action='remove' then clock_timestamp() end
    where id = p_id;
  elsif p_type = 'comment' then
    update forum_replies set status = case when p_action='approve' then 'visible' else 'hidden' end,
      removed_at = case when p_action='remove' then clock_timestamp() end
    where id = p_id;
  else
    raise exception 'bad target type';
  end if;
  update reports set status = case when p_action='approve' then 'dismissed' else 'resolved' end,
    resolved_by = auth.uid()
  where target_type = p_type and target_id = p_id and status = 'open';
  if p_action = 'approve' then
    update conduct_offenses set status = 'cleared', cleared_at = now(), cleared_by = auth.uid()
    where target_type = p_type and target_id = p_id and status = 'counted';
  elsif not exists (select 1 from conduct_offenses
                    where target_type = p_type and target_id = p_id and status = 'counted') then
    if p_type = 'post' then
      insert into conduct_offenses (user_id, target_type, target_id, source, excerpt)
      select author_id, 'post', id, 'coach_removal', left(case when trim(body) like trim(coalesce(title, '')) || '%' then trim(body) else trim(title) || ' — ' || trim(body) end, 200)
      from forum_posts where id = p_id;
    else
      insert into conduct_offenses (user_id, target_type, target_id, source, excerpt)
      select author_id, 'comment', id, 'coach_removal', left(trim(body), 200)
      from forum_replies where id = p_id;
    end if;
  end if;
  return jsonb_build_object('ok', true, 'action', p_action);
end $function$;

create or replace function public.activity_page(p_limit integer default 30)
 returns jsonb
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select coalesce(jsonb_agg(row order by created_at desc), '[]'::jsonb)
  from (
    select * from (
      select fr.created_at, jsonb_build_object(
        'kind', 'reply', 'post_id', fp.id,
        'post_title', coalesce(fp.title, left(fp.body, 60)),
        'author_name', coalesce(nullif(p.display_name,''),'A fighter'),
        'body', left(fr.body, 120), 'created_at', fr.created_at) as row
      from forum_replies fr
      join forum_posts fp on fp.id = fr.post_id and fp.author_id = auth.uid()
      left join profiles p on p.id = fr.author_id
      where fr.author_id <> auth.uid() and fr.status = 'visible'
      union all
      select coalesce(fp.removed_at, fp.created_at), jsonb_build_object(
        'kind', 'moderation', 'post_id', fp.id,
        'post_title', coalesce(fp.title, left(fp.body, 60)),
        'author_name', 'The coaches',
        'body', case when fp.status='pending_review'
                     then '⚠️ Warning: your post broke the TRUST code and was held for a coach to review. Keep posting like this and your account can be suspended or banned.'
                     else 'Your post was removed. Check the TRUST code, then come talk to us.' end,
        'created_at', coalesce(fp.removed_at, fp.created_at))
      from forum_posts fp
      where fp.author_id = auth.uid() and fp.status in ('pending_review','hidden')
      union all
      select coalesce(fr.removed_at, fr.created_at), jsonb_build_object(
        'kind', 'moderation', 'post_id', fr.post_id,
        'post_title', coalesce(fp.title, left(fp.body, 60)),
        'author_name', 'The coaches',
        'body', case when fr.status='pending_review'
                     then '⚠️ Warning: your reply broke the TRUST code and was held for a coach to review. Keep posting like this and your account can be suspended or banned.'
                     else 'Your reply was removed. Check the TRUST code, then come talk to us.' end,
        'created_at', coalesce(fr.removed_at, fr.created_at))
      from forum_replies fr
      join forum_posts fp on fp.id = fr.post_id
      where fr.author_id = auth.uid() and fr.status in ('pending_review','hidden')
      union all
      select a.decided_at, jsonb_build_object(
        'kind', 'moderation', 'post_id', null,
        'post_title', 'your fresh start',
        'author_name', 'The coaches',
        'body', case when a.status = 'approved'
                     then '🌱 Fresh start granted. Connect is open again. One more offense and posting turns off again.'
                     else 'Not yet. Keep training and showing the TRUST code, then ask again.' end,
        'created_at', a.decided_at)
      from connect_appeals a
      where a.user_id = auth.uid() and a.status in ('approved', 'denied')
    ) all_kinds
    order by (row->>'created_at') desc
    limit least(greatest(p_limit,1), 50)
  ) a;
$function$;
