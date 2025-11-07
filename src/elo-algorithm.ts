import type { Outcome, EloEvent, FileEloData, StoreType, HistoryType } from './types';
import { DEFAULT_RATING, DEFAULT_K_FACTOR } from './constants';

export const SKIP_RATING = -1;
// Re-export DEFAULT_RATING for backward compatibility
export { DEFAULT_RATING };

// Re-export types for backward compatibility
export type { Outcome, EloEvent, FileEloData, StoreType, HistoryType };

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
	k = DEFAULT_K_FACTOR // Standard K-factor for ELO (can be adjusted)
): readonly [number, number] {
	const eA = expectedScore(rA, rB);
	const eB = 1 - eA;
	// ELO update formula: newRating = oldRating + K * (actualScore - expectedScore)
	// No clamping - ELO can go below 0 or above 1000 naturally
	const newA = Math.round(rA + k * (sA - eA));
	const newB = Math.round(rB + k * (1 - sA - eB));
	return [newA, newB] as const;
}
