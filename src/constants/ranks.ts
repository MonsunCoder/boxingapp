/**
 * Day 21 — Rank ladder types + label helpers.
 *
 * Everything factual about ranks lives in the DATABASE (rank_degrees,
 * rank_tiers, pathways) and arrives through the rank_status() RPC. This file
 * only knows how to *say* a rank out loud — "novice" + degree 2 -> "Novice II".
 *
 * "Prospect" is not a row you earn. It is the state of having earned nothing
 * yet: rank_status().current === null. Everyone starts there by showing up.
 */

export type RankRef = { tier: string; degree: number; sort_order: number };

export type RankRequirement = {
  kind: 'boxing' | 'ethics';
  group: string;
  content_id: string;
  title: string;
  type: string;
  pillar: string;
  done: boolean;
};

export type LadderEntry = {
  tier: string;
  degree: number;
  sort_order: number;
  earned: boolean;
  earned_at: string | null;
  req_count: number;
  ethics_count: number;
};

export type TierInfo = {
  tier: string;
  label: string;
  blurb: string | null;
  degrees_planned: number;
  sort_order: number;
};

export type RankStatus = {
  current: RankRef | null;
  next: RankRef | null;
  requirements: RankRequirement[];
  done_count: number;
  total_count: number;
  can_rank_up: boolean;
  ladder: LadderEntry[];
  tiers: TierInfo[];
};

export type RankUpResult = {
  ok: boolean;
  tier?: string;
  degree?: number;
  reason?: string;
  blocked_on_ethics?: string[];
  blocked_on_boxing?: string[];
};

export const START_RANK_TIER = 'prospect';
export const START_RANK_LABEL = 'Prospect';

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

export function roman(n: number): string {
  return ROMAN[n] ?? String(n);
}

export function tierInfo(tier: string, tiers: TierInfo[]): TierInfo | undefined {
  return tiers.find((t) => t.tier === tier);
}

export function tierLabel(tier: string, tiers: TierInfo[]): string {
  return tierInfo(tier, tiers)?.label ?? tier.charAt(0).toUpperCase() + tier.slice(1);
}

/**
 * "Novice II" for multi-degree tiers, plain "Champion" for single-degree ones.
 * Pass null for the starting state.
 */
export function rankLabel(ref: { tier: string; degree: number } | null, tiers: TierInfo[]): string {
  if (!ref) return START_RANK_LABEL;
  const label = tierLabel(ref.tier, tiers);
  const planned = tierInfo(ref.tier, tiers)?.degrees_planned ?? 1;
  return planned > 1 ? `${label} ${roman(ref.degree)}` : label;
}
