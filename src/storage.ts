import type { Vault } from 'obsidian';
import type { EloEvent, FileEloData, StoreType } from './elo-algorithm';

export function getStorageBasePath(vault: Vault): string {
	return `${vault.configDir}/plugins/obsidian-elo-compare/history`;
}

export function getEventsPath(vault: Vault): string {
	return `${getStorageBasePath(vault)}/events.json`;
}

export function getRatingsPath(vault: Vault): string {
	return `${getStorageBasePath(vault)}/ratings.json`;
}

/**
 * Read all events from storage
 */
export async function readEvents(vault: Vault): Promise<EloEvent[]> {
	const eventsPath = getEventsPath(vault);
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
export async function writeEvents(vault: Vault, events: EloEvent[]): Promise<void> {
	const eventsPath = getEventsPath(vault);
	const folder = getStorageBasePath(vault);

	await vault.adapter.mkdir(folder);
	await vault.adapter.write(eventsPath, JSON.stringify(events, null, 2));
}

/**
 * Read all ratings from storage
 */
export async function readRatings(vault: Vault): Promise<Record<string, FileEloData>> {
	const ratingsPath = getRatingsPath(vault);
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
	ratings: Record<string, FileEloData>
): Promise<void> {
	const ratingsPath = getRatingsPath(vault);
	const folder = getStorageBasePath(vault);

	await vault.adapter.mkdir(folder);
	await vault.adapter.write(ratingsPath, JSON.stringify(ratings, null, 2));
}

/**
 * Read the complete store (for backward compatibility with old store.json)
 */
export async function readStore(vault: Vault): Promise<StoreType> {
	// Try to read from new storage location first
	const events = await readEvents(vault);
	const ratings = await readRatings(vault);

	// If we have data in new location, use it
	if (events.length > 0 || Object.keys(ratings).length > 0) {
		return {
			version: 1,
			events,
			ratings,
		};
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
export async function writeStore(vault: Vault, store: StoreType): Promise<void> {
	await writeEvents(vault, store.events);
	await writeRatings(vault, store.ratings);
}
