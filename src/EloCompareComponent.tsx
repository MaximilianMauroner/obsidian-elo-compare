import { useState, useEffect, useCallback } from 'react';
import { TFile } from 'obsidian';
import { PluginInfo } from 'main';
type SelectedFile = {
	file: TFile;
	frontmatter: Record<string, unknown>;
	snippet?: string;
	// enriched fields for UI and scoring
	name?: string; // derived from settings.frontmatterProperty
	rating?: number; // current rating (from frontmatter if present, else default)
	isFinished?: boolean; // true if required property exists and is valid
	error?: string; // error message if not finished or other issues
};

type VaultLike = {
	read?: (file: TFile) => Promise<string>;
};

function eloUpdate(winnerRating: number, loserRating: number, k = 32) {
	// primitive Elo: expected score and new rating
	const expectedWinner = 1 / (1 + Math.pow(10, (loserRating - winnerRating) / 400));
	const expectedLoser = 1 / (1 + Math.pow(10, (winnerRating - loserRating) / 400));

	const newWinner = Math.round(winnerRating + k * (1 - expectedWinner));
	const newLoser = Math.round(loserRating + k * (0 - expectedLoser));

	return [newWinner, newLoser];
}

export const EloCompareComponent = ({ pluginInfo }: { pluginInfo: PluginInfo }) => {
	const { settings, metadata, vault } = pluginInfo;
	const [items, setItems] = useState<SelectedFile[]>([]);
	const [pair, setPair] = useState<[number, number]>([0, 1]);
	const [history, setHistory] = useState<string[]>([]);

	const pickPair = useCallback(() => {
		if (!items || items.length < 2) {
			setPair([0, 0]);
			return;
		}
		const finishedIdx = items
			.map((it, idx) => (it.isFinished ? idx : -1))
			.filter((idx) => idx >= 0);

		const pool = finishedIdx.length >= 2 ? finishedIdx : items.map((_, i) => i);
		const a = Math.floor(Math.random() * pool.length);
		let b = a;
		while (b === a) {
			b = Math.floor(Math.random() * pool.length);
		}
		setPair([pool[a], pool[b]]);
	}, [items]);

	const getFileInfo = (file: TFile) => {
		const cache = metadata.getCache(file.path);
		return { file: file, frontmatter: cache ? cache.frontmatter : {} };
	};

	const [selectedFiles, setSelectedFiles] = useState<SelectedFile[] | null>(null);
	const [loadingSelectedFiles, setLoadingSelectedFiles] = useState(false);
	const [selectedFilesError, setSelectedFilesError] = useState<string | null>(null);

	const getSelectedFiles = useCallback(
		async (files: TFile[]) => {
			// Determine which files are in the configured folder.
			// If includeSubfoldersByDefault is true include any file whose path contains the folder prefix.
			// Otherwise only include files directly inside the folder (no deeper subfolders).
			const folder = settings.defaultFolder || '';

			const candidates = files.filter((file) => {
				if (!folder) return true; // no folder restriction
				if (!file.path.startsWith(folder + '/')) return false;
				if (settings.includeSubfoldersByDefault) return true;
				// if not including subfolders: ensure the remaining path has no additional '/'
				const relative = file.path.slice(folder.length + 1);
				return !relative.includes('/');
			});

			// Map to SelectedFile and read a small snippet in parallel.
			const promises = candidates.map(async (file) => {
				try {
					const info = getFileInfo(file);
					let snippet: string | undefined = undefined;
					// read a short preview; guard in case vault.read isn't available or fails
					if (vault) {
						const reader = (vault as VaultLike).read;
						if (typeof reader === 'function') {
							try {
								const content = await reader(file);
								snippet = content.split('\n').slice(0, 6).join('\n');
							} catch (_e: unknown) {
								// ignore read errors for individual files
							}
						}
					}
					return {
						file: info.file,
						frontmatter: info.frontmatter,
						snippet,
					} as SelectedFile;
				} catch (e) {
					return null;
				}
			});

			const results = await Promise.all(promises);
			return results.filter((r): r is SelectedFile => !!r);
		},
		[settings, metadata, vault]
	);

	// Build comparison items from selected files using configured frontmatter property
	useEffect(() => {
		if (!selectedFiles) return;

		const prop = settings.frontmatterProperty || '';
		const fmKeyForRating = ['rating', 'eloRating']; // accepted rating keys

		// determine default rating for new joiners: average of explicit ratings, else 1200
		const explicitRatings: number[] = [];
		for (const sf of selectedFiles) {
			const fm = sf.frontmatter || ({} as Record<string, unknown>);
			const maybe = fmKeyForRating
				.map((k) => (fm as Record<string, unknown>)[k])
				.find((v) => typeof v === 'number');
			if (typeof maybe === 'number') explicitRatings.push(maybe);
		}
		const defaultRating =
			explicitRatings.length > 0
				? Math.round(explicitRatings.reduce((a, b) => a + b, 0) / explicitRatings.length)
				: 1200;

		const newItems: SelectedFile[] = selectedFiles.map((sf) => {
			const fm = sf.frontmatter || ({} as Record<string, unknown>);
			const rawName = prop ? (fm as Record<string, unknown>)[prop] : undefined;
			const hasProp = !!prop;
			const validName = typeof rawName === 'string' && rawName.trim().length > 0;
			const isFinished = hasProp && validName;
			let error: string | undefined = undefined;
			if (!hasProp) error = 'frontmatterProperty not set in settings';
			else if (!validName) error = `Missing or invalid property "${prop}"`;

			// rating: use explicit numeric rating if present, otherwise defaultRating
			const maybeRating = fmKeyForRating
				.map((k) => (fm as Record<string, unknown>)[k])
				.find((v) => typeof v === 'number');
			const rating =
				typeof maybeRating === 'number' ? (maybeRating as number) : defaultRating;

			return {
				...sf,
				name: validName ? (rawName as string) : sf.file.path,
				rating,
				isFinished,
				error,
			} as SelectedFile;
		});

		setItems(newItems);
		// pick initial pair
		if (newItems.length >= 2) {
			setPair([0, 1]);
		} else {
			setPair([0, 0]);
		}
	}, [selectedFiles, settings.frontmatterProperty]);

	const handleWin = (winnerIndex: number) => {
		const loserIndex = pair[0] === winnerIndex ? pair[1] : pair[0];

		const winner = items[winnerIndex];
		const loser = items[loserIndex];

		// if either item is unfinished, don't apply ratings; prompt to skip
		if (!winner?.isFinished || !loser?.isFinished) {
			setHistory((h) => [
				`Skipped rating update due to unfinished item(s): ${
					!winner?.isFinished ? winner?.name ?? winner?.file.path : ''
				}${!winner?.isFinished && !loser?.isFinished ? ' and ' : ''}${
					!loser?.isFinished ? loser?.name ?? loser?.file.path : ''
				}`,
				...h,
			]);
			pickPair();
			return;
		}

		const [newWinnerRating, newLoserRating] = eloUpdate(
			winner.rating ?? 1200,
			loser.rating ?? 1200
		);

		const newItems = items.map((it, idx) => {
			if (idx === winnerIndex) return { ...it, rating: newWinnerRating };
			if (idx === loserIndex) return { ...it, rating: newLoserRating };
			return it;
		});

		setItems(newItems);

		setHistory((h) => [
			`${winner.name ?? winner.file.path} (R:${winner.rating} → ${newWinnerRating}) beat ${
				loser.name ?? loser.file.path
			} (R:${loser.rating} → ${newLoserRating})`,
			...h,
		]);

		// pick next pair (same two in this mock)
		pickPair();
	};

	useEffect(() => {
		let cancelled = false;
		setLoadingSelectedFiles(true);
		setSelectedFilesError(null);

		(async () => {
			try {
				const files = await getSelectedFiles(vault.getMarkdownFiles());
				if (!cancelled) setSelectedFiles(files);
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

	const reset = () => {
		// rebuild from selectedFiles using current settings
		if (!selectedFiles) {
			setItems([]);
		} else {
			// trigger rebuild by resetting selectedFiles (useEffect depends on it)
			setItems([]);
			// no-op: keeping selectedFiles, items will be rebuilt on settings change only; so rebuild manually:
			const prop = settings.frontmatterProperty || '';
			const fmKeyForRating = ['rating', 'eloRating']; // accepted rating keys
			const explicitRatings: number[] = [];
			for (const sf of selectedFiles) {
				const fm = sf.frontmatter || ({} as Record<string, unknown>);
				const maybe = fmKeyForRating
					.map((k) => (fm as Record<string, unknown>)[k])
					.find((v) => typeof v === 'number');
				if (typeof maybe === 'number') explicitRatings.push(maybe);
			}
			const defaultRating =
				explicitRatings.length > 0
					? Math.round(
							explicitRatings.reduce((a, b) => a + b, 0) / explicitRatings.length
					  )
					: 1200;

			const newItems: SelectedFile[] = selectedFiles.map((sf) => {
				const fm = sf.frontmatter || ({} as Record<string, unknown>);
				const rawName = prop ? (fm as Record<string, unknown>)[prop] : undefined;
				const hasProp = !!prop;
				const validName = typeof rawName === 'string' && rawName.trim().length > 0;
				const isFinished = hasProp && validName;
				let error: string | undefined = undefined;
				if (!hasProp) error = 'frontmatterProperty not set in settings';
				else if (!validName) error = `Missing or invalid property "${prop}"`;

				const maybeRating = fmKeyForRating
					.map((k) => (fm as Record<string, unknown>)[k])
					.find((v) => typeof v === 'number');
				const rating =
					typeof maybeRating === 'number' ? (maybeRating as number) : defaultRating;

				return {
					...sf,
					name: validName ? (rawName as string) : sf.file.path,
					rating,
					isFinished,
					error,
				} as SelectedFile;
			});
			setItems(newItems);
		}
		setHistory([]);
		pickPair();
	};

	const left = items[pair[0]];
	const right = items[pair[1]];

	return (
		<div style={{ padding: 12, fontFamily: 'system-ui, sans-serif' }}>
			<h3>Elo Compare</h3>

			<div
				style={{
					marginBottom: 8,
					fontSize: 12,
					color: 'var(--text-muted)',
				}}
			>
				{loadingSelectedFiles ? (
					<span>Loading files…</span>
				) : selectedFilesError ? (
					<span style={{ color: 'var(--danger)' }}>Error: {selectedFilesError}</span>
				) : selectedFiles ? (
					<span>
						{selectedFiles.length} file(s) loaded from "
						{settings.defaultFolder || 'all folders'}"
					</span>
				) : (
					<span>No files loaded</span>
				)}
			</div>

			{items.length < 2 && (
				<div
					style={{
						marginBottom: 12,
						fontSize: 12,
						color: 'var(--text-muted)',
					}}
				>
					Need at least two comparable items. Ensure the setting "frontmatter property" is
					set and present as a non-empty string in your notes.
				</div>
			)}

			<div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
				<div
					style={{
						flex: 1,
						border: '1px solid var(--interactive-border)',
						padding: 8,
						borderRadius: 6,
					}}
				>
					<h4 style={{ margin: 4 }}>{left?.name ?? left?.file.path}</h4>
					<div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
						Rating: {left?.rating}
					</div>
					{!left?.isFinished && (
						<div style={{ fontSize: 12, color: 'var(--warning)' }}>
							{left?.error || 'Item not finished; cannot be compared yet.'}
						</div>
					)}
					<pre style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>{left?.snippet}</pre>
					<button onClick={() => handleWin(pair[0])} disabled={!left?.isFinished}>
						Choose {left?.name ?? left?.file.path}
					</button>
				</div>

				<div
					style={{
						flex: 1,
						border: '1px solid var(--interactive-border)',
						padding: 8,
						borderRadius: 6,
					}}
				>
					<h4 style={{ margin: 4 }}>{right?.name ?? right?.file.path}</h4>
					<div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
						Rating: {right?.rating}
					</div>
					{!right?.isFinished && (
						<div style={{ fontSize: 12, color: 'var(--warning)' }}>
							{right?.error || 'Item not finished; cannot be compared yet.'}
						</div>
					)}
					<pre style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>{right?.snippet}</pre>
					<button onClick={() => handleWin(pair[1])} disabled={!right?.isFinished}>
						Choose {right?.name ?? right?.file.path}
					</button>
				</div>
			</div>

			<div style={{ marginBottom: 12 }}>
				<button onClick={reset} style={{ marginRight: 8 }}>
					Reset
				</button>
				<button onClick={pickPair} style={{ marginRight: 8 }}>
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
				<h4 style={{ marginTop: 0 }}>History</h4>
				{history.length === 0 ? (
					<div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
						No comparisons yet.
					</div>
				) : (
					<ul style={{ paddingLeft: 18 }}>
						{history.map((h, i) => (
							<li key={i} style={{ fontSize: 13 }}>
								{h}
							</li>
						))}
					</ul>
				)}
			</div>
		</div>
	);
};
