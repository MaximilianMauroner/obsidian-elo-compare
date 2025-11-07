import { TFile, MetadataCache } from 'obsidian';
import type { SelectedFile, EloCompareSettings, PluginInfo } from '../types';
import { DEFAULT_RATING } from '../constants';

/**
 * Gets file information including frontmatter
 */
export function getFileInfo(file: TFile, metadata: MetadataCache) {
	const cache = metadata.getCache(file.path);
	return {
		file,
		frontmatter: cache ? cache.frontmatter : null,
	};
}

/**
 * Checks if a file is within the configured folder and subfolder settings
 */
function isFileInFolder(
	file: TFile,
	folder: string,
	includeSubfolders: boolean
): boolean {
	if (!folder) return true; // No folder restriction

	if (!file.path.startsWith(folder + '/')) return false;

	if (includeSubfolders) return true;

	// Check if file is directly in folder (not in subfolder)
	const relative = file.path.slice(folder.length + 1);
	return !relative.includes('/');
}

/**
 * Converts Obsidian files to SelectedFile objects with default ratings
 */
export async function convertFilesToSelectedFiles(
	files: TFile[],
	settings: EloCompareSettings,
	metadata: MetadataCache,
	defaultPool: string
): Promise<SelectedFile[]> {
	// Filter files based on folder settings
	const candidates = files.filter((file) =>
		isFileInFolder(file, settings.defaultFolder, settings.includeSubfoldersByDefault ?? false)
	);

	// Convert to SelectedFile objects
	const promises = candidates.map(async (file) => {
		try {
			const info = getFileInfo(file, metadata);
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
	return results.filter((r): r is SelectedFile => !!r);
}

