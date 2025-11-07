import { useState, useEffect, useCallback } from 'react';
import type { Vault } from 'obsidian';
import type { StoreType } from '../types';
import { readStore, writeStore } from '../storage';

/**
 * Custom hook for loading and managing the Elo store
 */
export function useStore(vault: Vault, comparisonType: string = 'default') {
	const [store, setStore] = useState<StoreType | null>(null);

	useEffect(() => {
		console.log('[EloCompare] Loading store for type:', comparisonType);
		let cancelled = false;

		(async () => {
			try {
				const storeData = await readStore(vault, comparisonType);
				if (!cancelled) {
					setStore(storeData);
				}
			} catch (e) {
				console.error('[EloCompare] Failed to load store', e);
				// Use default empty store
				if (!cancelled) {
					setStore({ version: 1, events: [], ratings: {} });
				}
			}
		})();

		return () => {
			cancelled = true;
		};
	}, [vault, comparisonType]);

	const updateStore = useCallback(
		async (newStore: StoreType) => {
			setStore(newStore);
			try {
				await writeStore(vault, newStore, comparisonType);
			} catch (e) {
				console.error('Failed to persist store', e);
			}
		},
		[vault, comparisonType]
	);

	return { store, updateStore };
}

