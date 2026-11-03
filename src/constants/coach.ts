/**
 * Day 40 — client-side vocabulary for AI Guidance.
 *
 * The server sends reason CODES; the human copy lives here in data
 * (placeholder — client punch-up later). The coach's display name is
 * still pending the client consult, so it's a constant with one home.
 */

export const COACH_NAME = 'Coach'; // placeholder — client is picking the real name

/** Decision 3 (2026-11-03): kids always see that the coach is an AI. */
export const AI_COACH_LABEL = 'AI coach';

export type Recommendation = {
  content_id: string;
  title: string;
  type: string;
  pillar: string;
  duration_min: number | null;
  pathway_id: string | null;
  reason: 'ethics_gate' | 'belt_step' | 'journey' | 'streak' | string;
};

export type GuidanceResult = {
  premium: boolean;
  active_today?: boolean;
  recommendations?: Recommendation[];
  note?: string | null; // AI-phrased coach note (only when the key is configured)
};

export type CoachMessage = {
  id: string;
  role: 'user' | 'coach';
  content: string;
  created_at: string;
};

/** Placeholder copy — why the engine picked this. */
export const REASON_COPY: Record<string, string> = {
  moment: 'About what just happened on the feed — this one’s worth a run right now.',
  ethics_gate: 'Words first — this LESSON stands between you and your next belt.',
  belt_step: 'Your next belt needs this one.',
  journey: 'The next open step on your Journey.',
  streak: 'Nothing on the board today — a quick one keeps the flame alive.',
};

/** Types that run in the Train tab; everything else opens as a lesson. */
const TRAIN_TYPES = new Set(['workout', 'drill']);

export function guidanceLink(rec: Recommendation, returnTo: string): string {
  return TRAIN_TYPES.has(rec.type)
    ? `/train?open=${rec.content_id}`
    : `/lesson/${rec.content_id}?returnTo=${returnTo}`;
}

export const TYPE_GLYPH: Record<string, string> = {
  workout: '🥊',
  drill: '🎯',
  video_lesson: '🎬',
  article: '📖',
  ethics_scenario: '🕊️',
  short_film: '🎞️',
};
