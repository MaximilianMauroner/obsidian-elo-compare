import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { PluginInfo, SelectedFile, StoreType, HistoryType, EloCompareSettings } from './types';
import { DEFAULT_RATING, DEFAULT_K_FACTOR } from './constants';
import { DisplayEloItem } from './DisplayEloItem';
import { StatusBar } from './components/StatusBar';
import { FileList } from './components/FileList';
import { HistoryList } from './components/HistoryList';
import { TypeSelector } from './components/TypeSelector';
import { pickPair } from './helpers/pair-selection';
import { reconstructHistoryFromEvents } from './helpers/history-reconstruction';
import {
	createEloEvent,
	filterRecentEvents,
	updateRatingsAfterComparison,
	updateStoreRatings,
} from './helpers/elo-updates';
import { useStore } from './hooks/useStore';
import { useSelectedFiles } from './hooks/useSelectedFiles';

export const EloCompareComponent = ({ pluginInfo }: { pluginInfo: PluginInfo }) => {
	const { settings, vault, metadata, plugin } = pluginInfo;

	// Get current comparison type from pluginInfo or settings
	const typeConfigs = settings.typeConfigs || {};
	const availableTypes =
		Object.keys(typeConfigs).length > 0 ? Object.keys(typeConfigs) : ['default'];
	const initialType =
		pluginInfo.comparisonType ||
		settings.defaultComparisonType ||
		availableTypes[0] ||
		'default';

	const [comparisonType, setComparisonType] = useState(initialType);
	const { store, updateStore } = useStore(vault, comparisonType);

	// Get the configuration for the current comparison type
	const typeConfig = useMemo(() => {
		const typeConfigs = settings.typeConfigs || {};
		const config = typeConfigs[comparisonType];
		if (config) {
			return config;
		}
		// Fallback to defaults
		const displayName =
			comparisonType.charAt(0).toUpperCase() + comparisonType.slice(1).replace(/-/g, ' ');
		return {
			name: comparisonType,
			displayName: displayName,
			defaultFolder: '',
			frontmatterProperty: 'rating',
			includeSubfolders: false,
		};
	}, [settings, comparisonType]);

	// Create settings object with type-specific config
	const effectiveSettings = useMemo(
		() => ({
			...settings,
			defaultFolder: typeConfig.defaultFolder,
			frontmatterProperty: typeConfig.frontmatterProperty,
			includeSubfoldersByDefault: typeConfig.includeSubfolders || false,
		}),
		[settings, typeConfig]
	);

	const defaultPool = useMemo(
		() => typeConfig.defaultFolder || 'default',
		[typeConfig.defaultFolder]
	);
	const {
		selectedFiles,
		loading: loadingSelectedFiles,
		error: selectedFilesError,
	} = useSelectedFiles(vault, metadata, effectiveSettings, defaultPool);

	const [items, setItems] = useState<SelectedFile[]>([]);
	const [pair, setPair] = useState<[number, number]>([0, 1]);
	const [history, setHistory] = useState<HistoryType[]>([]);
	const hasInitializedRef = useRef(false);
	const previousTypeRef = useRef(comparisonType);

	// Handle type changes - reset state when type changes
	useEffect(() => {
		if (previousTypeRef.current !== comparisonType) {
			setItems([]);
			setPair([0, 1]);
			setHistory([]);
			hasInitializedRef.current = false;
			previousTypeRef.current = comparisonType;
		}
	}, [comparisonType]);

	const handleSettingsUpdate = useCallback(
		async (newSettings: EloCompareSettings) => {
			// Update settings in the plugin
			if (plugin) {
				plugin.settings = newSettings;
				await plugin.saveSettings();
			}
			// Update local settings reference
			Object.assign(settings, newSettings);
		},
		[plugin, settings]
	);

	const kFactor = DEFAULT_K_FACTOR;

	/**
	 * Handles a win/loss selection
	 */
	const handleWin = useCallback(
		(winnerIndex: number) => {
			if (!store) return; // Don't process if store is not loaded

			const [aIndex, bIndex] = pair;
			const itemA = items[aIndex];
			const itemB = items[bIndex];

			if (!itemA || !itemB) return;

			// Update ratings and create history entry
			const { updatedItems, newRatingA, newRatingB, historyEntry } =
				updateRatingsAfterComparison(
					items,
					itemA,
					itemB,
					aIndex,
					bIndex,
					winnerIndex,
					kFactor
				);

			setItems(updatedItems);
			setHistory((h) => [historyEntry, ...h]);

			// Create event and update store
			const newEvent = createEloEvent(itemA, itemB, winnerIndex, aIndex);
			const allEvents = [...store.events, newEvent];
			const recentEvents = filterRecentEvents(allEvents);

			const newRatings = updateStoreRatings(store, itemA, itemB, newRatingA, newRatingB);

			const updatedStore: StoreType = {
				version: 1,
				events: recentEvents,
				ratings: newRatings,
			};

			updateStore(updatedStore).catch((e) => console.error('Failed to update store', e));

			// Pick a new pair
			const newPair = pickPair(updatedItems);
			setPair(newPair);
		},
		[store, items, pair, kFactor, updateStore]
	);

	/**
	 * Picks a new random pair for comparison
	 */
	const handleSkip = useCallback(() => {
		const newPair = pickPair(items);
		setPair(newPair);
	}, [items]);

	/**
	 * Removes an item from the comparison pool
	 */
	const removeItem = useCallback(
		(index: number) => {
			const newItems = items.filter((_, i) => i !== index);
			setItems(newItems);
			if (newItems.length >= 2) {
				setPair([0, 1]);
			} else {
				setPair([0, 0]);
			}
		},
		[items]
	);

	/**
	 * Resets all ELO ratings to default
	 */
	const reset = useCallback(async () => {
		if (!confirm('This will reset all ELO ratings to default. Continue?')) {
			return;
		}

		try {
			const resetStore: StoreType = {
				version: 1,
				events: [],
				ratings: {},
			};
			await updateStore(resetStore);

			// Update items state to reflect reset ratings
			if (selectedFiles && selectedFiles.length > 0) {
				const resetItems = selectedFiles.map((file) => ({
					...file,
					rating: DEFAULT_RATING,
					games: 0,
					last: undefined,
				}));
				setItems(resetItems);
			}

			setHistory([]);
			hasInitializedRef.current = false;
		} catch (e) {
			console.error('Failed to reset', e);
			alert('Error resetting. Check console for details.');
		}
	}, [updateStore, selectedFiles]);

	/**
	 * Initialize items from selected files and store when both are ready
	 */
	useEffect(() => {
		if (store && selectedFiles && selectedFiles.length > 0 && !hasInitializedRef.current) {
			// Load ratings from store
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

			// Load history from events
			const historyEntries = reconstructHistoryFromEvents(selectedFiles, store, kFactor);
			setHistory(historyEntries);

			hasInitializedRef.current = true;
		}
	}, [selectedFiles, store?.events.length, kFactor, comparisonType]);

	const left = items[pair[0]];
	const right = items[pair[1]];

	return (
		<div className="markdown-rendered">
			<h3>Elo Compare</h3>

			<TypeSelector
				currentType={comparisonType}
				settings={settings}
				pluginInfo={pluginInfo}
				onTypeChange={setComparisonType}
				onSettingsUpdate={handleSettingsUpdate}
			/>

			<StatusBar
				loadingSelectedFiles={loadingSelectedFiles}
				selectedFilesError={selectedFilesError}
				items={items}
				typeConfig={typeConfig}
				onReset={reset}
			/>

			{!loadingSelectedFiles && !selectedFilesError && items.length > 0 && (
				<FileList items={items} pluginInfo={pluginInfo} />
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
				<button className="mod-contrast" onClick={handleSkip}>
					Skip
				</button>
			</div>

			<div>
				<h4>History</h4>
				<HistoryList history={history} pluginInfo={pluginInfo} />
			</div>
		</div>
	);
};
