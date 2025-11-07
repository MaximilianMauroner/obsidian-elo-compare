import { FrontMatterCache, TFile, App, MetadataCache, Vault } from 'obsidian';

export type ComparisonTypeConfig = {
	name: string; // Internal identifier (e.g., "books", "movies")
	displayName: string; // User-friendly display name (e.g., "Books", "Movies")
	defaultFolder: string;
	frontmatterProperty: string;
	includeSubfolders?: boolean;
};

export type EloCompareSettings = {
	defaultComparisonType?: string; // Default type to use
	typeConfigs: Record<string, ComparisonTypeConfig>; // Per-type configurations
};

export type PluginInfo = {
	vault: Vault;
	settings: EloCompareSettings;
	metadata: MetadataCache;
	app: App;
	comparisonType?: string; // Current comparison type being used
	plugin?: any; // Plugin instance for saving settings
};

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

export type Outcome = 0 | 0.5 | 1; // score for "a"

export interface EloEvent {
	t: number; // timestamp
	a: string; // id of item a (e.g., file path)
	b: string; // id of item b
	s: Outcome; // outcome for a (1 win, 0 loss, 0.5 draw)
}

export interface FileEloData {
	rating: number;
	games: number;
	pool: string;
	last?: string;
}

export interface StoreType {
	version: 1;
	events: EloEvent[]; // append-only
	ratings: Record<string, FileEloData>; // file path -> ELO data
}

export type HistoryType = {
	winner: SelectedFile;
	loser: SelectedFile;
	winnerOldRating: number;
	winnerNewRating: number;
	loserOldRating: number;
	loserNewRating: number;
};
