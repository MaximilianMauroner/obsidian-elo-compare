import { useState, useEffect, useCallback, useMemo } from 'react';
import { FrontMatterCache, TFile } from 'obsidian';
import { PluginInfo } from 'main';
import {
	DEFAULT_RATING,
	EloEvent,
	StoreV1,
	eloUpdate,
	toScore100,
	type Outcome,
} from './elo-algorithm';

export interface SelectedFile {
	id: string; // stable id (file path)
	file: TFile;
	frontmatter: FrontMatterCache | null;
	name: string;
	rating: number; // 0–100
	games: number;
	pool: string;
	last?: string;
}

function readEloStateFromFrontmatter(
	fm: FrontMatterCache | null | undefined,
	ratingProp: string,
	defaultPool: string
): { rating: number; games: number; pool: string; last?: string } | null {
	let rating: number | null = null;
	let games = 0;
	let pool = defaultPool;
	let last: string | undefined;

	if (fm && Object.prototype.hasOwnProperty.call(fm, 'elo')) {
		const elo = fm.elo;
		if (typeof elo === 'number') {
			rating = Math.round(elo);
		} else if (elo && typeof elo === 'object') {
			const maybe = toScore100(elo.rating);
			if (typeof maybe === 'number') rating = maybe;
			if (typeof elo.games === 'number') games = elo.games;
			if (typeof elo.pool === 'string') pool = elo.pool;
			if (typeof elo.last === 'string') last = elo.last;
		}
	}

	if (rating == null) {
		const base = toScore100(fm ? fm[ratingProp] : undefined);
		if (typeof base !== 'number') return null;
		rating = base;
	}

	return { rating, games, pool, last };
}

export const EloCompareComponent = ({ pluginInfo }: { pluginInfo: PluginInfo }) => {
	const { settings, metadata, vault } = pluginInfo;
	const [store, setStore] = useState<StoreV1>({ version: 1, events: [] });
	const [items, setItems] = useState<SelectedFile[]>([]);
	const [pair, setPair] = useState<[number, number]>([0, 1]);
	const [history, setHistory] = useState<string[]>([]);
	const [selectedFiles, setSelectedFiles] = useState<SelectedFile[] | null>(null);
	const [loadingSelectedFiles, setLoadingSelectedFiles] = useState(false);
	const [selectedFilesError, setSelectedFilesError] = useState<string | null>(null);

	const kFactor = useMemo(() => {
		return 3;
	}, []);

	const defaultPool = useMemo(() => {
		return settings.defaultFolder || 'default';
	}, [settings.defaultFolder]);

	const pickPair = useCallback(() => {
		if (!items || items.length < 2) {
			setPair([0, 0]);
			return;
		}
		const indices = items.map((_, i) => i);
		const a = Math.floor(Math.random() * indices.length);
		let b = a;
		while (b === a) {
			b = Math.floor(Math.random() * indices.length);
		}
		setPair([indices[a], indices[b]]);
	}, [items]);

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
					if (!info.frontmatter) return null;
					const state = readEloStateFromFrontmatter(
						info.frontmatter,
						settings.frontmatterProperty,
						defaultPool
					);
					if (!state) return null;
					return {
						id: file.path,
						file: info.file,
						name: file.basename,
						frontmatter: info.frontmatter,
						rating: state.rating,
						games: state.games,
						pool: state.pool,
						last: state.last,
					} as SelectedFile;
				} catch {
					return null;
				}
			});

			const results = await Promise.all(promises);
			return results.filter((r): r is SelectedFile => !!r);
		},
		[settings, metadata, defaultPool]
	);

	// Build comparison items from selected files using configured frontmatter property
	useEffect(() => {
		if (!selectedFiles) return;
		setItems(selectedFiles);
		if (selectedFiles.length >= 2) {
			setPair([0, 1]);
		} else {
			setPair([0, 0]);
		}
	}, [selectedFiles]);

	// Load/persist plugin store (events) if provided by PluginInfo
	useEffect(() => {
		let cancelled = false;
		(async () => {
			try {
				const data = await pluginInfo?.loadData?.();
				if (!cancelled && data && typeof data === 'object' && data.version === 1) {
					setStore(data as StoreV1);
				}
			} catch {
				// ignore, default empty store
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [pluginInfo]);

	const persistStore = useCallback(
		async (next: StoreV1) => {
			setStore(next);
			try {
				await pluginInfo?.saveData?.(next);
			} catch {
				// ignore
			}
		},
		[pluginInfo]
	);

	const appendEvent = useCallback(
		async (ev: EloEvent) => {
			const next: StoreV1 = { version: 1, events: [...store.events, ev] };
			await persistStore(next);
		},
		[store.events, persistStore]
	);

	const recomputeFromEvents = useCallback(() => {
		if (!items || items.length === 0 || !store.events.length) return;
		const byId = new Map(items.map((it) => [it.id, { ...it, rating: it.rating, games: 0 }]));
		for (const ev of store.events) {
			const A = byId.get(ev.a);
			const B = byId.get(ev.b);
			if (!A || !B) continue; // skip events outside the current pool
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
			A.last = new Date(ev.t).toISOString().slice(0, 10);
			B.last = A.last;
		}
		setItems(Array.from(byId.values()));
	}, [items, store.events, kFactor]);

	const handleWin = (winnerIndex: number) => {
		const aIdx = pair[0];
		const bIdx = pair[1];
		const aWins: Outcome = winnerIndex === aIdx ? 1 : 0;

		const a = items[aIdx];
		const b = items[bIdx];

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

		setHistory((h) => [
			`${(winnerIndex === aIdx ? a : b).name} beat ${
				winnerIndex === aIdx ? b.name : a.name
			} — (${a.name}: ${a.rating} → ${newAR}, ${b.name}: ${b.rating} → ${newBR})`,
			...h,
		]);

		// Append to event log
		void appendEvent({
			t: Date.now(),
			a: a.id,
			b: b.id,
			s: aWins,
		});

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
	// all comparisons (frontmatter remains a readable snapshot until you "Save").
	useEffect(() => {
		if (selectedFiles && selectedFiles.length && store.events.length) {
			recomputeFromEvents();
		}
	}, [selectedFiles, store.events, recomputeFromEvents]);

	const reset = () => {
		if (!selectedFiles) {
			setItems([]);
		} else {
			setItems(selectedFiles);
		}
		setHistory([]);
		pickPair();
	};

	const save = () => {
		// Persist events store
		void persistStore(store);

		// Persist frontmatter snapshot with elo object for visibility
		for (const item of items) {
			const fm = item.frontmatter;
			void (async () => {
				try {
					const content = await vault.read(item.file);

					const fmObjRaw = fm ? ({ ...fm } as Record<string, unknown>) : {};
					// Remove Obsidian metadata-only keys that shouldn't be written back
					delete fmObjRaw.position;

					const newFmObj: Record<string, unknown> = {
						...fmObjRaw,
						elo: {
							pool: item.pool,
							rating: item.rating,
							games: item.games,
							last: item.last ?? new Date().toISOString().slice(0, 10),
						},
					};

					const serializeValue = (v: unknown, indent = 0): string => {
						const pad = '  '.repeat(indent);
						if (v && typeof v === 'object' && !Array.isArray(v)) {
							const entries = Object.entries(v as Record<string, unknown>)
								.map(([k, vv]) => {
									const val =
										typeof vv === 'string'
											? JSON.stringify(vv)
											: typeof vv === 'number' ||
											  typeof vv === 'boolean' ||
											  vv === null
											? String(vv)
											: JSON.stringify(vv);
									return `${pad}  ${k}: ${val}`;
								})
								.join('\n');
							return `\n${entries}`;
						}
						if (typeof v === 'string') {
							return v.includes('\n') || v.includes(':') ? JSON.stringify(v) : v;
						}
						if (typeof v === 'number' || typeof v === 'boolean' || v === null) {
							return String(v);
						}
						return JSON.stringify(v);
					};

					const fmLines = Object.entries(newFmObj).map(([k, v]) => {
						if (v && typeof v === 'object' && !Array.isArray(v)) {
							return `${k}:${serializeValue(v, 0)}`;
						}
						return `${k}: ${serializeValue(v, 0)}`;
					});
					const newFrontmatter = `---\n${fmLines.join('\n')}\n---\n`;

					const newContent = content.startsWith('---\n')
						? content.replace(/^---\n[\s\S]*?\n---\n/, newFrontmatter)
						: `${newFrontmatter}${content}`;

					await vault.modify(item.file, newContent);
				} catch (e) {
					console.error('Failed to save file', item.file.path, e);
				}
			})();
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
								<button onClick={save}>Save</button>
								<button onClick={recomputeFromEvents}>Recompute</button>
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
				/>
				<DisplayEloItem
					item={right}
					onChoose={() => handleWin(pair[1])}
					onRemove={() => removeItem(pair[1])}
				/>
			</div>

			<div style={{ marginBottom: 12, display: 'flex', gap: 8 }}>
				<button className="mod-warning" onClick={reset}>
					Reset
				</button>
				<button className="mod-contrast" onClick={pickPair}>
					Skip
				</button>
				<button
					onClick={() => {
						// swap sides (visual)
						setPair([pair[1], pair[0]]);
					}}
				>
					Swap Sides
				</button>
			</div>

			<div>
				<h4>History</h4>
				{history.length === 0 ? (
					<div className="mod-muted">No comparisons yet.</div>
				) : (
					<ul>
						{history.map((h, i) => (
							<li key={i}>{h}</li>
						))}
					</ul>
				)}
			</div>
		</div>
	);
};

const DisplayEloItem = ({
	item,
	onChoose,
	onRemove,
}: {
	item?: SelectedFile;
	onChoose: () => void;
	onRemove?: () => void;
}) => {
	return (
		<div className="callout" data-callout="quote" style={{ flex: 1, position: 'relative' }}>
			<div className="callout-title">
				<div className="callout-title-inner">{item?.name ?? item?.file.path}</div>
			</div>
			<div className="callout-content">
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
