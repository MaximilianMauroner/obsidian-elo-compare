import type { SelectedFile, StoreType, HistoryType, EloEvent } from '../types';
import { DEFAULT_RATING } from '../constants';
import { eloUpdate } from '../elo-algorithm';
import { DEFAULT_K_FACTOR } from '../constants';

/**
 * Reconstructs history from events by replaying them step by step
 */
export function reconstructHistoryFromEvents(
	selectedFiles: SelectedFile[],
	store: StoreType,
	kFactor: number = DEFAULT_K_FACTOR
): HistoryType[] {
	if (!selectedFiles || selectedFiles.length === 0) {
		return [];
	}

	if (!store || !store.events.length) {
		return [];
	}

	// Create a map of files by id for quick lookup
	const filesById = new Map(selectedFiles.map((f) => [f.id, f]));

	// Initialize ratings from store or defaults
	const byId = new Map<string, SelectedFile & { games: number }>();
	for (const file of selectedFiles) {
		const stored = store.ratings[file.id];
		byId.set(file.id, {
			...file,
			rating: stored?.rating ?? DEFAULT_RATING,
			games: stored?.games ?? 0,
		});
	}

	const historyEntries: HistoryType[] = [];

	// Replay events and build history
	for (const event of store.events) {
		const fileA = filesById.get(event.a);
		const fileB = filesById.get(event.b);
		if (!fileA || !fileB) continue; // Skip events outside the current pool

		const A = byId.get(event.a);
		const B = byId.get(event.b);
		if (!A || !B) continue;

		// Record old ratings
		const oldRatingA = A.rating ?? DEFAULT_RATING;
		const oldRatingB = B.rating ?? DEFAULT_RATING;

		// Apply ELO update
		const [newRatingA, newRatingB] = eloUpdate(oldRatingA, oldRatingB, event.s, kFactor);

		// Determine winner and loser (skip draws)
		const winner = event.s === 1 ? fileA : event.s === 0 ? fileB : null;
		const loser = event.s === 1 ? fileB : event.s === 0 ? fileA : null;

		if (winner && loser) {
			const winnerOldRating = event.s === 1 ? oldRatingA : oldRatingB;
			const winnerNewRating = event.s === 1 ? newRatingA : newRatingB;
			const loserOldRating = event.s === 1 ? oldRatingB : oldRatingA;
			const loserNewRating = event.s === 1 ? newRatingB : newRatingA;

			historyEntries.push({
				winner,
				loser,
				winnerOldRating,
				winnerNewRating,
				loserOldRating,
				loserNewRating,
			});
		}

		// Update ratings for next iteration
		A.rating = newRatingA;
		B.rating = newRatingB;
		A.games += 1;
		B.games += 1;
	}

	return historyEntries;
}

