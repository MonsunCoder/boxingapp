-- Undo for post_build_security_1_forum_writes. Puts the direct-write rules back.
-- Also revert the merge of prep/security-1-forum-writes, or the Ladder share
-- keeps working (it would simply stay on create_post, which is harmless).
-- is_staff() stays security definer and removed_at stays: both are harmless,
-- and moderate_content and activity_page need removed_at.
create policy p_posts_insert on public.forum_posts for insert with check ((author_id = auth.uid()) and can_post(auth.uid()));
create policy p_posts_moderate on public.forum_posts for update using ((author_id = auth.uid()) or is_staff());
create policy p_replies_insert on public.forum_replies for insert with check ((author_id = auth.uid()) and can_post(auth.uid()));
create policy p_comments_insert on public.forum_comments for insert with check ((author_id = auth.uid()) and can_post(auth.uid()));
create policy p_comments_moderate on public.forum_comments for update using ((author_id = auth.uid()) or is_staff());
grant insert, update on public.forum_posts, public.forum_replies, public.forum_comments to authenticated;
