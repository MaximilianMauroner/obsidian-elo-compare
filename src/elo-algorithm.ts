import { SelectedFile } from './EloCompareComponent';

export const SKIP_RATING = -1;
export const DEFAULT_RATING = 1000; // Default ELO rating (0-1000 scale)

export type Outcome = 0 | 0.5 | 1; // score for "a"

export interface EloEvent {
	t: number; // timestamp
	a: string; // id of item a (e.g., file path)
	b: string; // id of item b
	s: Outcome; // outcome for a (1 win, 0 loss, 0.5 draw)
}

export interface FileEloData {
	rating: number;
	games: number;
	pool: string;
	last?: string;
}

export interface StoreType {
	version: 1;
	events: EloEvent[]; // append-only
	ratings: Record<string, FileEloData>; // file path -> ELO data
}

export type HistoryType = {
	winner: SelectedFile;
	loser: SelectedFile;
	winnerOldRating: number;
	winnerNewRating: number;
	loserOldRating: number;
	loserNewRating: number;
};

function expectedScore(rA: number, rB: number): number {
	// Standard ELO expected score formula
	return 1 / (1 + Math.pow(10, (rB - rA) / 400));
}

// General update for a pair (works for wins/losses/draws)
// Uses standard ELO formula with K-factor
export function eloUpdate(
	rA: number,
	rB: number,
	sA: Outcome,
	k = 32 // Standard K-factor for ELO (can be adjusted)
): readonly [number, number] {
	const eA = expectedScore(rA, rB);
	const eB = 1 - eA;
	// ELO update formula: newRating = oldRating + K * (actualScore - expectedScore)
	// No clamping - ELO can go below 0 or above 1000 naturally
	const newA = Math.round(rA + k * (sA - eA));
	const newB = Math.round(rB + k * (1 - sA - eB));
	return [newA, newB] as const;
}
