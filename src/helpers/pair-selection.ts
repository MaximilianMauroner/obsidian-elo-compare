import type { SelectedFile } from '../types';

/**
 * Finds the item with the minimum number of games played
 */
function findMinimumGames(items: SelectedFile[]): number {
	let minimumGames = Infinity;
	for (const item of items) {
		const games = item.games ?? 0;
		if (games < minimumGames) {
			minimumGames = games;
		}
	}
	return minimumGames;
}

/**
 * Gets all items with a specific number of games
 */
function getItemsWithGames(
	items: SelectedFile[],
	targetGames: number
): Array<{ item: SelectedFile; index: number }> {
	return items
		.map((item, index) => ({ item, index, games: item.games ?? 0 }))
		.filter(({ games }) => games === targetGames)
		.map(({ item, index }) => ({ item, index }));
}

/**
 * Selects a random pair of items for comparison, prioritizing items with fewer games
 */
export function pickPair(items: SelectedFile[]): [number, number] {
	if (items.length < 2) {
		return [0, 0];
	}

	// Find items with the minimum number of games
	const minimumGames = findMinimumGames(items);
	const itemsWithMinGames = getItemsWithGames(items, minimumGames);

	// Fallback: pick random pair if no items found
	if (itemsWithMinGames.length === 0) {
		const a = Math.floor(Math.random() * items.length);
		let b = a;
		while (b === a) {
			b = Math.floor(Math.random() * items.length);
		}
		return [a, b];
	}

	// Pick a random item from those with minimum games
	const selectedItem = itemsWithMinGames[Math.floor(Math.random() * itemsWithMinGames.length)];
	const selectedIndex = selectedItem.index;

	// Pick a different item to compare against
	const otherIndices = items
		.map((_, i) => i)
		.filter((i) => i !== selectedIndex)
		.map((idx) => ({
			idx,
			games: items[idx]?.games ?? 0,
		}));

	// Sort by games count and pick from bottom 50% for variety
	otherIndices.sort((a, b) => a.games - b.games);
	const halfPoint = Math.ceil(otherIndices.length / 2);
	const candidates = otherIndices.slice(0, halfPoint);

	const otherIndex = candidates[Math.floor(Math.random() * candidates.length)].idx;

	return [selectedIndex, otherIndex];
}

