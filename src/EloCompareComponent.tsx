import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { FrontMatterCache, TFile } from 'obsidian';
import { PluginInfo } from 'main';
import {
	DEFAULT_RATING,
	EloEvent,
	StoreType,
	FileEloData,
	eloUpdate,
	type Outcome,
	HistoryType,
} from './elo-algorithm';
import { readStore, writeStore } from './storage';

export interface SelectedFile {
	id: string;
	file: TFile;
	frontmatter: FrontMatterCache | null;
	name: string;
	rating: number;
	games: number;
	pool: string;
	last?: string;
}

export const EloCompareComponent = ({ pluginInfo }: { pluginInfo: PluginInfo }) => {
	const { settings, metadata, vault } = pluginInfo;
	const [store, setStore] = useState<StoreType | null>(null);
	const [items, setItems] = useState<SelectedFile[]>([]);
	const [pair, setPair] = useState<[number, number]>([0, 1]);
	const [history, setHistory] = useState<HistoryType[]>([]);
	const [selectedFiles, setSelectedFiles] = useState<SelectedFile[] | null>(null);
	const [loadingSelectedFiles, setLoadingSelectedFiles] = useState(false);
	const [selectedFilesError, setSelectedFilesError] = useState<string | null>(null);
	const hasInitializedRef = useRef(false);

	const kFactor = useMemo(() => {
		return 32; // Standard ELO K-factor
	}, []);

	const defaultPool = useMemo(() => {
		return settings.defaultFolder || 'default';
	}, [settings.defaultFolder]);

	const pickPair = () => {
		if (!items || items.length < 2) {
			setPair([0, 0]);
			return;
		}

		// Find the item with the least comparisons (lowest games count)
		let leastComparedGames = Infinity;
		for (let i = 0; i < items.length; i++) {
			const games = items[i]?.games ?? 0;
			if (games < leastComparedGames) {
				leastComparedGames = games;
			}
		}

		// If multiple items have the same minimum games, randomly pick one of them
		const itemsWithMinGames = items
			.map((item, idx) => ({ item, idx, games: item.games ?? 0 }))
			.filter(({ games }) => games === leastComparedGames);

		if (itemsWithMinGames.length === 0) {
			// Fallback: just pick random pair
			const a = Math.floor(Math.random() * items.length);
			let b = a;
			while (b === a) {
				b = Math.floor(Math.random() * items.length);
			}
			setPair([a, b]);
			return;
		}

		const selectedLeastCompared =
			itemsWithMinGames[Math.floor(Math.random() * itemsWithMinGames.length)].idx;

		// Pick a different item to compare against (prefer items that haven't been compared much either)
		const otherIndices = items.map((_, i) => i).filter((i) => i !== selectedLeastCompared);

		// Prefer items with similar or lower game counts to ensure variety
		const otherItemsWithGames = otherIndices.map((idx) => ({
			idx,
			games: items[idx]?.games ?? 0,
		}));

		// Sort by games count (ascending) and pick from the bottom 50% to ensure variety
		otherItemsWithGames.sort((a, b) => a.games - b.games);
		const halfPoint = Math.ceil(otherItemsWithGames.length / 2);
		const candidates = otherItemsWithGames.slice(0, halfPoint);

		const otherIndex = candidates[Math.floor(Math.random() * candidates.length)].idx;

		setPair([selectedLeastCompared, otherIndex]);
	};

	const getFileInfo = (file: TFile) => {
		const cache = metadata.getCache(file.path);
		return { file: file, frontmatter: cache ? cache.frontmatter : null };
	};

	const getSelectedFiles = useCallback(
		async (files: TFile[]) => {
			// Determine which files are in the configured folder.
			const folder = settings.defaultFolder;

			const candidates = files.filter((file) => {
				if (!folder) return true; // no folder restriction
				if (!file.path.startsWith(folder + '/')) return false;
				if (settings.includeSubfoldersByDefault) return true;
				const relative = file.path.slice(folder.length + 1);
				return !relative.includes('/');
			});

			const promises = candidates.map(async (file) => {
				try {
					const info = getFileInfo(file);
					// Use default ELO data - ratings will be updated from store
					// in a separate effect after store loads (see useEffect at line 539)
					// This allows files to be loaded immediately without waiting for store
					return {
						id: file.path,
						file: info.file,
						name: file.basename,
						frontmatter: info.frontmatter,
						rating: DEFAULT_RATING,
						games: 0,
						pool: defaultPool,
					} as SelectedFile;
				} catch (e) {
					console.error('[EloCompare] Error processing file:', file.path, e);
					return null;
				}
			});

			const results = await Promise.all(promises);
			const validResults = results.filter((r): r is SelectedFile => !!r);
			return validResults;
		},
		[settings, metadata, defaultPool]
	);

	// Load/persist plugin store (events) if provided by PluginInfo
	useEffect(() => {
		console.log('[EloCompare] Loading store');
		let cancelled = false;
		(async () => {
			try {
				const storeData = await readStore(pluginInfo.vault);
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
	}, [pluginInfo]);

	const persistStore = useCallback(
		async (next: StoreType) => {
			setStore(next);
			try {
				await writeStore(pluginInfo.vault, next);
			} catch (e) {
				console.error('Failed to persist store', e);
			}
		},
		[pluginInfo]
	);

	// Limit events to only recent ones (last 200 events or last 30 days)
	const MAX_EVENTS = 200;
	const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

	const recomputeFromEvents = useCallback(
		(shouldPersist = false) => {
			if (!store) return;

			// Recompute ratings from events and update store
			// shouldPersist: only true when we want to save (e.g., on manual recompute), false on initial load
			if (!selectedFiles || selectedFiles.length === 0) {
				return;
			}

			// Start from stored ratings or defaults - preserve ALL existing ratings
			const newRatings: Record<string, FileEloData> = { ...store.ratings };
			const byId = new Map<string, SelectedFile & { games: number }>();

			// Initialize ratings for currently selected files from stored ratings or defaults
			for (const file of selectedFiles) {
				const stored = store.ratings[file.id];
				const currentRating = stored?.rating ?? DEFAULT_RATING;
				const currentGames = stored?.games ?? 0;

				byId.set(file.id, {
					...file,
					rating: currentRating,
					games: currentGames,
				});

				// Ensure rating exists in newRatings for selected files
				if (!newRatings[file.id]) {
					newRatings[file.id] = {
						rating: currentRating,
						games: currentGames,
						pool: file.pool,
						last: stored?.last,
					};
				}
			}

			// Replay all events to update ratings (ratings in store should already reflect events,
			// but we replay to ensure consistency and handle any missing events)
			for (const ev of store.events) {
				const A = byId.get(ev.a);
				const B = byId.get(ev.b);
				if (!A || !B) {
					// File not in current selection - update rating directly in newRatings if it exists
					const fileA = newRatings[ev.a];
					const fileB = newRatings[ev.b];
					if (fileA && fileB) {
						const [rA, rB] = eloUpdate(
							fileA.rating ?? DEFAULT_RATING,
							fileB.rating ?? DEFAULT_RATING,
							ev.s,
							kFactor
						);
						fileA.rating = rA;
						fileB.rating = rB;
						fileA.games = (fileA.games ?? 0) + 1;
						fileB.games = (fileB.games ?? 0) + 1;
						const nowISO = new Date(ev.t).toISOString().slice(0, 10);
						fileA.last = nowISO;
						fileB.last = nowISO;
					}
					continue;
				}

				const [rA, rB] = eloUpdate(
					A.rating ?? DEFAULT_RATING,
					B.rating ?? DEFAULT_RATING,
					ev.s,
					kFactor
				);
				A.rating = rA;
				B.rating = rB;
				A.games += 1;
				B.games += 1;
				const nowISO = new Date(ev.t).toISOString().slice(0, 10);
				A.last = nowISO;
				B.last = nowISO;
			}

			// Update newRatings with computed values for selected files
			for (const [id, item] of byId.entries()) {
				newRatings[id] = {
					rating: item.rating,
					games: item.games,
					pool: item.pool,
					last: item.last,
				};
			}

			// Update store with new ratings (preserving all existing ratings)
			const updatedStore: StoreType = {
				...store,
				ratings: newRatings,
			};
			setStore(updatedStore);
			// Only persist if explicitly requested (e.g., manual recompute button)
			if (shouldPersist) {
				void persistStore(updatedStore);
			}

			// Update items for display - ensure we include ALL selectedFiles, not just those in byId
			// byId should have all selectedFiles, but let's be safe
			const allItems = Array.from(byId.values());

			// Ensure we have all files from selectedFiles
			if (allItems.length !== selectedFiles.length) {
				console.warn(
					'[EloCompare] Mismatch! byId has',
					allItems.length,
					'but selectedFiles has',
					selectedFiles.length
				);
				// Rebuild from selectedFiles to ensure we have all files
				const itemsMap = new Map(allItems.map((item) => [item.id, item]));
				for (const file of selectedFiles) {
					if (!itemsMap.has(file.id)) {
						const stored = store.ratings[file.id];
						itemsMap.set(file.id, {
							...file,
							rating: stored?.rating ?? DEFAULT_RATING,
							games: stored?.games ?? 0,
						});
					}
				}
				const correctedItems = Array.from(itemsMap.values());
				setItems(correctedItems);
			} else {
				setItems(allItems);
			}
		},
		[selectedFiles, store, kFactor, persistStore]
	);

	const loadHistoryFromEvents = useCallback(() => {
		// Reconstruct history from events by replaying them step by step
		if (!selectedFiles || selectedFiles.length === 0) {
			setHistory([]);
			return;
		}

		if (!store || !store.events.length) {
			setHistory([]);
			return;
		}

		// Create a map of files by id for quick lookup
		const filesById = new Map(selectedFiles.map((f) => [f.id, f]));

		// Start from stored ratings or defaults
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
		for (const ev of store.events) {
			const fileA = filesById.get(ev.a);
			const fileB = filesById.get(ev.b);
			if (!fileA || !fileB) continue; // skip events outside the current pool

			const A = byId.get(ev.a);
			const B = byId.get(ev.b);
			if (!A || !B) continue;

			// Record old ratings
			const oldRatingA = A.rating ?? DEFAULT_RATING;
			const oldRatingB = B.rating ?? DEFAULT_RATING;

			// Apply ELO update
			const [newRatingA, newRatingB] = eloUpdate(oldRatingA, oldRatingB, ev.s, kFactor);

			// Determine winner and loser
			const winner = ev.s === 1 ? fileA : ev.s === 0 ? fileB : null;
			const loser = ev.s === 1 ? fileB : ev.s === 0 ? fileA : null;

			// Only add to history if there's a clear winner (not a draw)
			if (winner && loser) {
				const winnerOldRating = ev.s === 1 ? oldRatingA : oldRatingB;
				const winnerNewRating = ev.s === 1 ? newRatingA : newRatingB;
				const loserOldRating = ev.s === 1 ? oldRatingB : oldRatingA;
				const loserNewRating = ev.s === 1 ? newRatingB : newRatingA;

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

		console.log('[EloCompare] Reconstructed', historyEntries.length, 'history entries');
		setHistory(historyEntries);
	}, [selectedFiles, store?.events, store?.ratings, kFactor]);

	const handleWin = (winnerIndex: number) => {
		// Early return if store is not loaded to prevent data loss
		// The comparison should only be recorded when we can persist it
		if (!store) return;

		const aIdx = pair[0];
		const bIdx = pair[1];
		const aWins: Outcome = winnerIndex === aIdx ? 1 : 0;

		const a = items[aIdx];
		const b = items[bIdx];

		if (!a || !b) return; // Safety check

		// Calculate new ratings using current ratings (which may already include previous events)
		const [newAR, newBR] = eloUpdate(
			a.rating ?? DEFAULT_RATING,
			b.rating ?? DEFAULT_RATING,
			aWins,
			kFactor
		);

		const nowISO = new Date().toISOString().slice(0, 10);
		const newItems = items.map((it, idx) => {
			if (idx === aIdx) return { ...it, rating: newAR, games: it.games + 1, last: nowISO };
			if (idx === bIdx) return { ...it, rating: newBR, games: it.games + 1, last: nowISO };
			return it;
		});

		setItems(newItems);

		// Update store.ratings
		const newRatings: Record<string, FileEloData> = { ...store.ratings };
		newRatings[a.id] = {
			rating: newAR,
			games: a.games + 1,
			pool: a.pool,
			last: nowISO,
		};
		newRatings[b.id] = {
			rating: newBR,
			games: b.games + 1,
			pool: b.pool,
			last: nowISO,
		};

		const winner = winnerIndex === aIdx ? a : b;
		const loser = winnerIndex === aIdx ? b : a;
		const winnerOldRating = winnerIndex === aIdx ? a.rating : b.rating;
		const winnerNewRating = winnerIndex === aIdx ? newAR : newBR;
		const loserOldRating = winnerIndex === aIdx ? b.rating : a.rating;
		const loserNewRating = winnerIndex === aIdx ? newBR : newAR;

		setHistory((h) => [
			{ winner, loser, winnerOldRating, winnerNewRating, loserOldRating, loserNewRating },
			...h,
		]);

		// Append to event log and update ratings in store
		const now = Date.now();
		const newEvent: EloEvent = {
			t: now,
			a: a.id,
			b: b.id,
			s: aWins,
		};

		// Keep only recent events: last MAX_EVENTS or events within MAX_AGE_MS
		// Only filter when adding new events, not on every update
		const allEvents = [...store.events, newEvent];
		const recentEvents = allEvents.filter((e) => now - e.t < MAX_AGE_MS).slice(-MAX_EVENTS); // Keep last MAX_EVENTS events

		const updatedStore: StoreType = {
			version: 1,
			events: recentEvents,
			ratings: newRatings,
		};
		setStore(updatedStore);
		void persistStore(updatedStore);

		pickPair();
	};

	const removeItem = (index: number) => {
		// Remove an item (e.g., if it has an error) and pick a new valid pair
		const newItems = items.filter((_, i) => i !== index);
		setItems(newItems);
		if (newItems.length >= 2) {
			// reset to a simple valid pair; next comparisons can use Skip to randomize
			setPair([0, 1]);
		} else {
			setPair([0, 0]);
		}
	};

	useEffect(() => {
		let cancelled = false;
		setLoadingSelectedFiles(true);
		setSelectedFilesError(null);

		(async () => {
			try {
				const files = await getSelectedFiles(vault.getMarkdownFiles());
				if (!cancelled) {
					setSelectedFiles(files);
				}
			} catch (e: unknown) {
				if (!cancelled) setSelectedFilesError(String(e ?? 'Unknown error'));
			} finally {
				if (!cancelled) setLoadingSelectedFiles(false);
			}
		})();

		return () => {
			cancelled = true;
		};
	}, [getSelectedFiles, vault]);

	// After both store and selected files load, recompute from events to reflect
	// all comparisons (ratings are stored in store.json).
	// Only recompute on initial load, not after every comparison (to avoid overwriting updates)
	useEffect(() => {
		// Only initialize once when both store and selectedFiles are ready
		if (store && selectedFiles && selectedFiles.length > 0 && !hasInitializedRef.current) {
			// On initial load, just use stored ratings directly (don't recompute or persist)
			// Ratings in store are already computed from events
			const itemsWithRatings = selectedFiles.map((file) => {
				const stored = store.ratings[file.id];
				return {
					...file,
					rating: stored?.rating ?? DEFAULT_RATING,
					games: stored?.games ?? 0,
					last: stored?.last,
				};
			});
			setItems(itemsWithRatings);

			// Load history from events (will be empty if no events)
			loadHistoryFromEvents();
			hasInitializedRef.current = true;
		}
		// Intentionally omit recomputeFromEvents and loadHistoryFromEvents to avoid function-identity loops.
		// Only recompute on initial load when selectedFiles changes or store.events.length changes from 0 to >0
	}, [selectedFiles, store?.events.length]);

	const reset = async () => {
		if (!confirm('This will reset all ELO ratings to default. Continue?')) {
			return;
		}

		try {
			const resetStore: StoreType = {
				version: 1,
				events: [],
				ratings: {},
			};
			await persistStore(resetStore);

			// Update items state to reflect reset ratings
			// The useEffect won't run again due to hasInitializedRef, so we update directly
			if (selectedFiles && selectedFiles.length > 0) {
				const resetItems = selectedFiles.map((file) => ({
					...file,
					rating: DEFAULT_RATING,
					games: 0,
					last: undefined,
				}));
				setItems(resetItems);
			}

			// Clear history
			setHistory([]);

			// Reset the initialization flag so future store changes can trigger the effect
			hasInitializedRef.current = false;
		} catch (e) {
			console.error('Failed to reset', e);
			alert('Error resetting. Check console for details.');
		}
	};

	const left = items[pair[0]];
	const right = items[pair[1]];

	return (
		<div className="markdown-rendered">
			<h3>Elo Compare</h3>

			<div className="callout" data-callout="note" style={{ marginBottom: 8 }}>
				<div className="callout-content">
					{loadingSelectedFiles ? (
						<span>Loading files…</span>
					) : selectedFilesError ? (
						<span className="mod-warning">Error: {selectedFilesError}</span>
					) : selectedFiles ? (
						<div
							style={{
								display: 'flex',
								justifyContent: 'space-between',
								alignItems: 'center',
							}}
						>
							<span className="mod-muted">
								{items.length} file(s) loaded from "
								{settings.defaultFolder || 'all folders'}"
							</span>
							<div style={{ display: 'flex', gap: 8 }}>
								<button onClick={() => recomputeFromEvents(true)}>Recompute</button>
								<button className="mod-warning" onClick={reset}>
									Reset
								</button>
							</div>
						</div>
					) : (
						<span className="mod-muted">No files loaded</span>
					)}
				</div>
			</div>

			{/* Accordion to reveal all loaded files without changing CSS */}
			{!loadingSelectedFiles && !selectedFilesError && items && items.length > 0 && (
				<details style={{ marginBottom: 12 }}>
					<summary style={{ cursor: 'pointer' }}>Show files ({items.length})</summary>
					<div className="callout" data-callout="info" style={{ marginTop: 8 }}>
						<div className="callout-content">
							<ul style={{ margin: 0, paddingLeft: 20 }}>
								{items.map((sf) => (
									<li key={sf.file.path}>
										{sf.name}
										<span className="mod-muted">
											{' '}
											— {sf.rating} (games: {sf.games})
										</span>
									</li>
								))}
							</ul>
						</div>
					</div>
				</details>
			)}

			{items.length < 2 && (
				<div className="callout" data-callout="warning" style={{ marginBottom: 12 }}>
					<div className="callout-title">
						<div className="callout-title-inner">Not enough items</div>
					</div>
					<div className="callout-content mod-muted">
						Need at least two comparable items. Ensure the setting "frontmatter
						property" is set and present as a non-empty string in your notes.
					</div>
				</div>
			)}

			<div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
				<DisplayEloItem
					item={left}
					onChoose={() => handleWin(pair[0])}
					onRemove={() => removeItem(pair[0])}
					pluginInfo={pluginInfo}
				/>
				<DisplayEloItem
					item={right}
					onChoose={() => handleWin(pair[1])}
					onRemove={() => removeItem(pair[1])}
					pluginInfo={pluginInfo}
				/>
			</div>

			<div style={{ marginBottom: 12, display: 'flex', gap: 8 }}>
				<button className="mod-contrast" onClick={pickPair}>
					Skip
				</button>
			</div>

			<div>
				<h4>History</h4>
				{history.length === 0 ? (
					<div className="mod-muted">No comparisons yet.</div>
				) : (
					<ul>
						{history.map((h, i) => (
							<li key={i}>
								<span>
									<a
										href="#"
										className="internal-link"
										onClick={(e) => {
											e.preventDefault();
											// Open file in Obsidian
											const file = h.winner.file;
											pluginInfo.app.workspace.openLinkText(
												file.path,
												'',
												false
											);
										}}
									>
										{h.winner.name}
									</a>
								</span>
								{' beat '}
								<span>
									<a
										href="#"
										className="internal-link"
										onClick={(e) => {
											e.preventDefault();
											// Open file in Obsidian
											const file = h.loser.file;
											pluginInfo.app.workspace.openLinkText(
												file.path,
												'',
												false
											);
										}}
									>
										{h.loser.name}
									</a>
								</span>
								{' — ('}
								<span>
									<a
										href="#"
										className="internal-link"
										onClick={(e) => {
											e.preventDefault();
											pluginInfo.app.workspace.openLinkText(
												h.winner.file.path,
												'',
												false
											);
										}}
									>
										{h.winner.name}
									</a>
								</span>
								{`: ${h.winnerOldRating} → ${h.winnerNewRating}, `}
								<span>
									<a
										href="#"
										className="internal-link"
										onClick={(e) => {
											e.preventDefault();
											pluginInfo.app.workspace.openLinkText(
												h.loser.file.path,
												'',
												false
											);
										}}
									>
										{h.loser.name}
									</a>
								</span>
								{`: ${h.loserOldRating} → ${h.loserNewRating})`}
							</li>
						))}
					</ul>
				)}
			</div>
		</div>
	);
};

// Helper function to extract cover image path from frontmatter
function getCoverImage(
	frontmatter: FrontMatterCache | null,
	file: TFile,
	pluginInfo: PluginInfo
): string | null {
	if (!frontmatter) return null;

	// Check common cover property names
	const coverProps = ['cover', 'cover-image', 'coverImage', 'image', 'thumbnail', 'thumb'];
	for (const prop of coverProps) {
		const coverValue = frontmatter[prop];

		if (coverValue) {
			let coverPath: string;

			// Handle different value types
			if (typeof coverValue === 'string') {
				coverPath = coverValue;
			} else if (Array.isArray(coverValue) && coverValue.length > 0) {
				// Handle array values (take first element)
				coverPath = String(coverValue[0]);
			} else {
				// Convert to string
				coverPath = String(coverValue);
			}

			// Trim whitespace
			coverPath = coverPath.trim();

			// Resolve the path relative to the file
			if (coverPath.startsWith('http://') || coverPath.startsWith('https://')) {
				// Web URL - return as is
				return coverPath;
			} else if (coverPath.startsWith('[') && coverPath.includes('](')) {
				// Markdown image syntax: ![alt](path)
				const match = coverPath.match(/\]\(([^)]+)\)/);
				if (match) {
					const imagePath = match[1];
					const resolved = resolveImagePath(imagePath, file, pluginInfo);
					console.log(
						'[EloCompare] Resolved markdown image path:',
						imagePath,
						'->',
						resolved
					);
					return resolved;
				}
			} else {
				// Direct path
				const resolved = resolveImagePath(coverPath, file, pluginInfo);
				return resolved;
			}
		}
	}
	console.log('[EloCompare] No cover found in frontmatter');
	return null;
}

// Helper function to resolve image path relative to file or vault root
function resolveImagePath(imagePath: string, file: TFile, pluginInfo: PluginInfo): string {
	// Remove leading # if present (fragment identifier)
	imagePath = imagePath.replace(/^#/, '');

	// Handle Obsidian wiki-link format [[image.png]] or [[folder/image.png]]
	if (imagePath.startsWith('[[') && imagePath.endsWith(']]')) {
		imagePath = imagePath.slice(2, -2);
	}

	// Remove any query parameters or anchors
	const cleanPath = imagePath.split('?')[0].split('#')[0];

	// Normalize the path
	let normalizedPath: string;

	// If path starts with /, it's relative to vault root
	if (cleanPath.startsWith('/')) {
		normalizedPath = cleanPath.slice(1);
	} else {
		// Otherwise, resolve relative to the file's directory
		const fileDir = file.parent?.path || '';
		const resolvedPath = fileDir ? `${fileDir}/${cleanPath}` : cleanPath;

		// Normalize path (handle .. and .)
		const parts = resolvedPath.split('/');
		const normalizedParts: string[] = [];
		for (const part of parts) {
			if (part === '..') {
				normalizedParts.pop();
			} else if (part !== '.' && part !== '') {
				normalizedParts.push(part);
			}
		}
		normalizedPath = normalizedParts.join('/');
	}

	// If the path doesn't have an extension, try to find the file with common image extensions
	// This will be handled in the loading logic if needed

	return normalizedPath;
}

const DisplayEloItem = ({
	item,
	onChoose,
	onRemove,
	pluginInfo,
}: {
	item?: SelectedFile;
	onChoose: () => void;
	onRemove?: () => void;
	pluginInfo: PluginInfo;
}) => {
	const [coverImageUrl, setCoverImageUrl] = useState<string | null>(null);
	const blobUrlRef = useRef<string | null>(null);
	const { vault } = pluginInfo;

	// Load cover image when item changes
	useEffect(() => {
		let cancelled = false;

		if (!item?.frontmatter || !item?.file) {
			setCoverImageUrl(null);
			return;
		}

		const coverPath = getCoverImage(item.frontmatter, item.file, pluginInfo);

		if (!coverPath) {
			setCoverImageUrl(null);
			return;
		}

		// If it's already a web URL, use it directly
		if (coverPath.startsWith('http://') || coverPath.startsWith('https://')) {
			setCoverImageUrl(coverPath);
			return;
		}

		// Clean up previous blob URL
		if (blobUrlRef.current) {
			URL.revokeObjectURL(blobUrlRef.current);
			blobUrlRef.current = null;
		}

		// Try to load the image file from vault
		(async () => {
			try {
				let imageFile = vault.getAbstractFileByPath(coverPath) as TFile | null;

				// If file not found, try to search for it more broadly
				if (!imageFile || !(imageFile instanceof TFile)) {
					// First, try adding extension if missing
					const hasExtension = /\.(png|jpg|jpeg|gif|webp|svg|bmp)$/i.test(coverPath);
					if (!hasExtension) {
						const imageExtensions = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'];
						for (const ext of imageExtensions) {
							const pathWithExt = `${coverPath}.${ext}`;
							const candidate = vault.getAbstractFileByPath(pathWithExt);
							if (candidate && candidate instanceof TFile) {
								imageFile = candidate;
								break;
							}
						}
					}

					// If still not found, search by filename in the vault
					if (!imageFile || !(imageFile instanceof TFile)) {
						const filename = coverPath.split('/').pop() || coverPath;
						const allFiles = vault.getFiles();

						// Try exact match first
						for (const file of allFiles) {
							if (file instanceof TFile && file.name === filename) {
								imageFile = file;
								break;
							}
						}

						// Try case-insensitive match
						if (!imageFile || !(imageFile instanceof TFile)) {
							const filenameLower = filename.toLowerCase();
							for (const file of allFiles) {
								if (
									file instanceof TFile &&
									file.name.toLowerCase() === filenameLower
								) {
									imageFile = file;
									break;
								}
							}
						}
					}
				}

				if (imageFile && imageFile instanceof TFile) {
					// Determine MIME type from file extension
					const extension = imageFile.extension.toLowerCase();
					const mimeTypes: Record<string, string> = {
						jpg: 'image/jpeg',
						jpeg: 'image/jpeg',
						png: 'image/png',
						gif: 'image/gif',
						webp: 'image/webp',
						svg: 'image/svg+xml',
						bmp: 'image/bmp',
					};
					const mimeType = mimeTypes[extension] || 'image/jpeg';

					// Read the file and create a blob URL
					const arrayBuffer = await vault.readBinary(imageFile);
					if (cancelled) return;

					const blob = new Blob([arrayBuffer], { type: mimeType });
					const blobUrl = URL.createObjectURL(blob);
					blobUrlRef.current = blobUrl;

					if (!cancelled) {
						setCoverImageUrl(blobUrl);
					} else {
						URL.revokeObjectURL(blobUrl);
					}
				} else {
					console.warn('[EloCompare] Image file not found at path:', coverPath);
					if (!cancelled) setCoverImageUrl(null);
				}
			} catch (e) {
				console.error('[EloCompare] Failed to load cover image:', coverPath, e);
				if (!cancelled) setCoverImageUrl(null);
			}
		})();

		return () => {
			cancelled = true;
			if (blobUrlRef.current) {
				URL.revokeObjectURL(blobUrlRef.current);
				blobUrlRef.current = null;
			}
		};
	}, [item?.frontmatter, item?.file?.path, pluginInfo, vault]);

	return (
		<div className="callout" data-callout="quote" style={{ flex: 1, position: 'relative' }}>
			<div className="callout-title">
				<div className="callout-title-inner">{item?.name ?? item?.file.path}</div>
			</div>
			<div className="callout-content">
				{coverImageUrl && (
					<div style={{ marginBottom: 12, textAlign: 'center' }}>
						<img
							src={coverImageUrl}
							alt={item?.name || 'Cover'}
							style={{
								maxWidth: '100%',
								maxHeight: '200px',
								objectFit: 'contain',
								borderRadius: '4px',
							}}
							onError={(e) => {
								// Hide image if it fails to load
								(e.target as HTMLImageElement).style.display = 'none';
							}}
						/>
					</div>
				)}
				<div className="mod-muted">Rating: {item?.rating}</div>
				{item && (
					<div
						style={{
							display: 'flex',
							gap: 8,
							marginTop: 6,
							marginBottom: 6,
						}}
					>
						{onRemove && (
							<button
								className="mod-warning"
								style={{
									position: 'absolute',
									top: 4,
									right: 4,
								}}
								onClick={onRemove}
							>
								Remove
							</button>
						)}
					</div>
				)}
				<button
					className="mod-cta"
					onClick={onChoose}
					title={item ? 'This item is unfinished. Remove or fix it.' : undefined}
				>
					Choose {item?.name ?? item?.file.path}
				</button>
			</div>
		</div>
	);
};
