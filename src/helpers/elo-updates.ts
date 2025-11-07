import type { SelectedFile, StoreType, EloEvent, HistoryType } from '../types';
import { eloUpdate } from '../elo-algorithm';
import { DEFAULT_RATING } from '../constants';
import { MAX_EVENTS, MAX_AGE_MS } from '../constants';

/**
 * Creates a new ELO event from a comparison
 */
export function createEloEvent(
	itemA: SelectedFile,
	itemB: SelectedFile,
	winnerIndex: number,
	aIndex: number
): EloEvent {
	const aWins: 0 | 1 = winnerIndex === aIndex ? 1 : 0;
	return {
		t: Date.now(),
		a: itemA.id,
		b: itemB.id,
		s: aWins,
	};
}

/**
 * Filters events to keep only recent ones
 */
export function filterRecentEvents(events: EloEvent[]): EloEvent[] {
	const now = Date.now();
	return events
		.filter((e) => now - e.t < MAX_AGE_MS)
		.slice(-MAX_EVENTS);
}

/**
 * Updates ratings after a comparison
 */
export function updateRatingsAfterComparison(
	items: SelectedFile[],
	itemA: SelectedFile,
	itemB: SelectedFile,
	aIndex: number,
	bIndex: number,
	winnerIndex: number,
	kFactor: number
): {
	updatedItems: SelectedFile[];
	newRatingA: number;
	newRatingB: number;
	historyEntry: HistoryType;
} {
	// Calculate new ratings
	const [newRatingA, newRatingB] = eloUpdate(
		itemA.rating ?? DEFAULT_RATING,
		itemB.rating ?? DEFAULT_RATING,
		winnerIndex === aIndex ? 1 : 0,
		kFactor
	);

	const nowISO = new Date().toISOString().slice(0, 10);

	// Update items
	const updatedItems = items.map((it, idx) => {
		if (idx === aIndex) {
			return { ...it, rating: newRatingA, games: it.games + 1, last: nowISO };
		}
		if (idx === bIndex) {
			return { ...it, rating: newRatingB, games: it.games + 1, last: nowISO };
		}
		return it;
	});

	// Create history entry
	const winner = winnerIndex === aIndex ? itemA : itemB;
	const loser = winnerIndex === aIndex ? itemB : itemA;
	const winnerOldRating = winnerIndex === aIndex ? itemA.rating : itemB.rating;
	const winnerNewRating = winnerIndex === aIndex ? newRatingA : newRatingB;
	const loserOldRating = winnerIndex === aIndex ? itemB.rating : itemA.rating;
	const loserNewRating = winnerIndex === aIndex ? newRatingB : newRatingA;

	const historyEntry: HistoryType = {
		winner,
		loser,
		winnerOldRating: winnerOldRating ?? DEFAULT_RATING,
		winnerNewRating,
		loserOldRating: loserOldRating ?? DEFAULT_RATING,
		loserNewRating,
	};

	return {
		updatedItems,
		newRatingA,
		newRatingB,
		historyEntry,
	};
}

/**
 * Updates the store ratings for specific items
 */
export function updateStoreRatings(
	store: StoreType,
	itemA: SelectedFile,
	itemB: SelectedFile,
	newRatingA: number,
	newRatingB: number
): Record<string, { rating: number; games: number; pool: string; last: string }> {
	const newRatings = { ...store.ratings };
	const nowISO = new Date().toISOString().slice(0, 10);

	newRatings[itemA.id] = {
		rating: newRatingA,
		games: itemA.games + 1,
		pool: itemA.pool,
		last: nowISO,
	};

	newRatings[itemB.id] = {
		rating: newRatingB,
		games: itemB.games + 1,
		pool: itemB.pool,
		last: nowISO,
	};

	return newRatings;
}

