/**
 * Connect conduct record (Jigar, 2026-11-03). The server decides standing
 * (my_connect_standing / connect_standing_for); the app only shows it.
 *
 *   good          — posting open
 *   final_warning — the 5th counted offense; one more turns Connect read-only
 *   banned        — read-only: read the feed and challenges, report posts,
 *                   but no posting, replying or voting
 *
 * A coach can grant a "fresh start" from an appeal: the count starts over,
 * but one more offense turns Connect read-only again.
 *
 * All copy below is placeholder (content phase).
 */

export type ConnectStanding = {
  state: 'good' | 'final_warning' | 'banned';
  offenses: number;
  final_warning_at: number;
  ban_at: number;
  fresh_start: boolean;
  appeal: 'open' | 'approved' | 'denied' | null;
};

export const APPEAL_REASONS: { key: 'learned' | 'filter_wrong' | 'other'; label: string }[] = [
  { key: 'learned', label: 'I know what I did and I’m ready to do better' },
  { key: 'filter_wrong', label: 'The filter got my words wrong' },
  { key: 'other', label: 'Something else' },
];

/** The line under a held post's warning, from the standing after the hold. */
export function standingLine(s: ConnectStanding | null): string {
  if (!s) return '';
  if (s.state === 'banned') {
    return 'You’ve hit the limit. Connect is now read-only for you: you can read, but not post, reply or vote.';
  }
  if (s.state === 'final_warning') {
    return 'FINAL WARNING. One more and Connect turns read-only for you.';
  }
  if (s.fresh_start) return 'You’re on your fresh start. One more and Connect turns read-only again.';
  return `That’s ${s.offenses} of ${s.final_warning_at} before a final warning.`;
}
