-- Undo for post_build_security_2_age_and_consent. Puts the direct writes back.
-- ALSO revert the merge of prep/security-2-age-and-consent first or the screens
-- keep calling the new functions (which stay, and still work).
grant insert, update on public.profiles to authenticated;
create policy p_consents_insert on public.parental_consents for insert with check (child_id = auth.uid());
grant insert, update on public.parental_consents to authenticated;
create or replace function public.can_post(p_user uuid)
 returns boolean language sql stable set search_path to 'public'
as $function$
  select exists (select 1 from profiles
    where id = p_user and consent_status in ('not_required','granted'))
    and not connect_banned(p_user);
$function$;
