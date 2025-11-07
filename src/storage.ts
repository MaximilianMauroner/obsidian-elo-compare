import type { Vault } from 'obsidian';
import type { EloEvent, FileEloData, StoreType } from './types';

export function getStorageBasePath(vault: Vault): string {
	return `${vault.configDir}/plugins/obsidian-elo-compare/history`;
}

export function getEventsPath(vault: Vault, comparisonType: string = 'default'): string {
	return `${getStorageBasePath(vault)}/events-${comparisonType}.json`;
}

export function getRatingsPath(vault: Vault, comparisonType: string = 'default'): string {
	return `${getStorageBasePath(vault)}/ratings-${comparisonType}.json`;
}

/**
 * Read all events from storage
 */
export async function readEvents(vault: Vault, comparisonType: string = 'default'): Promise<EloEvent[]> {
	const eventsPath = getEventsPath(vault, comparisonType);
	try {
		if (await vault.adapter.exists(eventsPath)) {
			const raw = await vault.adapter.read(eventsPath);
			const data = JSON.parse(raw);
			return Array.isArray(data) ? data : [];
		}
	} catch (e) {
		console.error('Failed to read events', e);
	}
	return [];
}

/**
 * Write all events to storage
 */
export async function writeEvents(vault: Vault, events: EloEvent[], comparisonType: string = 'default'): Promise<void> {
	const eventsPath = getEventsPath(vault, comparisonType);
	const folder = getStorageBasePath(vault);

	await vault.adapter.mkdir(folder);
	await vault.adapter.write(eventsPath, JSON.stringify(events, null, 2));
}

/**
 * Read all ratings from storage
 */
export async function readRatings(vault: Vault, comparisonType: string = 'default'): Promise<Record<string, FileEloData>> {
	const ratingsPath = getRatingsPath(vault, comparisonType);
	try {
		if (await vault.adapter.exists(ratingsPath)) {
			const raw = await vault.adapter.read(ratingsPath);
			const data = JSON.parse(raw);
			return typeof data === 'object' && data !== null ? data : {};
		}
	} catch (e) {
		console.error('Failed to read ratings', e);
	}
	return {};
}

/**
 * Write all ratings to storage
 */
export async function writeRatings(
	vault: Vault,
	ratings: Record<string, FileEloData>,
	comparisonType: string = 'default'
): Promise<void> {
	const ratingsPath = getRatingsPath(vault, comparisonType);
	const folder = getStorageBasePath(vault);

	await vault.adapter.mkdir(folder);
	await vault.adapter.write(ratingsPath, JSON.stringify(ratings, null, 2));
}

/**
 * Read the complete store (for backward compatibility with old store.json)
 */
export async function readStore(vault: Vault, comparisonType: string = 'default'): Promise<StoreType> {
	// Try to read from new storage location first
	const events = await readEvents(vault, comparisonType);
	const ratings = await readRatings(vault, comparisonType);

	// If we have data in new location, use it
	if (events.length > 0 || Object.keys(ratings).length > 0) {
		return {
			version: 1,
			events,
			ratings,
		};
	}

	// Try to migrate from old default location if this is the default type
	if (comparisonType === 'default') {
		const oldEventsPath = `${getStorageBasePath(vault)}/events.json`;
		const oldRatingsPath = `${getStorageBasePath(vault)}/ratings.json`;
		
		try {
			if (await vault.adapter.exists(oldEventsPath)) {
				const raw = await vault.adapter.read(oldEventsPath);
				const data = JSON.parse(raw);
				if (Array.isArray(data) && data.length > 0) {
					await writeEvents(vault, data, 'default');
				}
			}
			if (await vault.adapter.exists(oldRatingsPath)) {
				const raw = await vault.adapter.read(oldRatingsPath);
				const data = JSON.parse(raw);
				if (typeof data === 'object' && data !== null && Object.keys(data).length > 0) {
					await writeRatings(vault, data, 'default');
				}
			}
			// Re-read after migration
			const migratedEvents = await readEvents(vault, comparisonType);
			const migratedRatings = await readRatings(vault, comparisonType);
			if (migratedEvents.length > 0 || Object.keys(migratedRatings).length > 0) {
				return {
					version: 1,
					events: migratedEvents,
					ratings: migratedRatings,
				};
			}
		} catch (e) {
			console.error('Failed to migrate old storage', e);
		}
	}

	return {
		version: 1,
		events: [],
		ratings: {},
	};
}

/**
 * Write the complete store
 */
export async function writeStore(vault: Vault, store: StoreType, comparisonType: string = 'default'): Promise<void> {
	await writeEvents(vault, store.events, comparisonType);
	await writeRatings(vault, store.ratings, comparisonType);
}

/**
 * Delete all storage files for a comparison type
 */
export async function deleteTypeStorage(vault: Vault, comparisonType: string): Promise<void> {
	const eventsPath = getEventsPath(vault, comparisonType);
	const ratingsPath = getRatingsPath(vault, comparisonType);
	
	try {
		if (await vault.adapter.exists(eventsPath)) {
			await vault.adapter.remove(eventsPath);
		}
		if (await vault.adapter.exists(ratingsPath)) {
			await vault.adapter.remove(ratingsPath);
		}
	} catch (e) {
		console.error('Failed to delete type storage', e);
	}
}
