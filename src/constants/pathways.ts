/**
 * Day 24 — Pathway (Journey) types.
 *
 * A pathway is a PREREQUISITE GRAPH, not a simple ordered list (screen-list
 * decision D1): every node is required, but branching lets a kid choose order
 * at some points, and checkpoint nodes force sequence where it matters.
 *
 * All truth arrives through the pathway_map() RPC — `done` and `available`
 * are computed server-side. A node is available when every one of its
 * prerequisite nodes is complete; `prereq_titles` lists only the UNMET
 * prerequisites, ready for a "Finish X first" line.
 */

export type PathwayNode = {
  node_id: string;
  content_id: string;
  position: number;
  title: string;
  type: string;
  pillar: string;
  xp_value: number;
  duration_min: number | null;
  done: boolean;
  available: boolean;
  prereq_node_ids: string[];
  prereq_titles: string[];
};

/**
 * track — how a pathway is categorized on the Learn tab:
 *   'journey'  -> THE Journey: the required spine, front and center
 *   'belt'     -> referenced by rank degrees (what belts ask for)
 *   'optional' -> everything else
 * difficulty is free-text data ('beginner', …) — placeholder taxonomy.
 */
export type PathwayTrack = 'journey' | 'belt' | 'optional';

export type PathwayInfo = {
  id: string;
  title: string;
  description: string | null;
  sort_order: number;
  track: PathwayTrack;
  difficulty: string;
  category: string;
  done_count: number;
  total_count: number;
  nodes: PathwayNode[];
};

export const TRACK_SECTIONS: { track: PathwayTrack; title: string; blurb: string }[] = [
  { track: 'journey', title: 'The Journey', blurb: 'Required. This is the road — every step counts.' },
  { track: 'belt', title: 'Belt pathways', blurb: 'What your next rank asks for.' },
  { track: 'optional', title: 'Optional', blurb: 'Extra work for when you want more.' },
];

export const isTrainType = (t: string) => t === 'workout' || t === 'drill';

export const TYPE_EMOJI: Record<string, string> = {
  video_lesson: '📖',
  article: '📰',
  workout: '🥊',
  drill: '🥊',
  ethics_scenario: '🕊️',
  short_film: '🎬',
};
