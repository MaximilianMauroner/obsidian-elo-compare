import { useState, useEffect, useCallback } from 'react';
import type { Vault, MetadataCache } from 'obsidian';
import type { SelectedFile, EloCompareSettings } from '../types';
import { convertFilesToSelectedFiles } from '../helpers/file-filtering';

/**
 * Custom hook for loading and managing selected files
 */
export function useSelectedFiles(
	vault: Vault,
	metadata: MetadataCache,
	settings: EloCompareSettings,
	defaultPool: string
) {
	const [selectedFiles, setSelectedFiles] = useState<SelectedFile[] | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const reload = useCallback(async () => {
		setLoading(true);
		setError(null);

		try {
			const files = await convertFilesToSelectedFiles(
				vault.getMarkdownFiles(),
				settings,
				metadata,
				defaultPool
			);
			setSelectedFiles(files);
		} catch (e: unknown) {
			setError(String(e ?? 'Unknown error'));
		} finally {
			setLoading(false);
		}
	}, [vault, metadata, settings, defaultPool]);

	useEffect(() => {
		let cancelled = false;

		(async () => {
			setLoading(true);
			setError(null);

			try {
				const files = await convertFilesToSelectedFiles(
					vault.getMarkdownFiles(),
					settings,
					metadata,
					defaultPool
				);
				if (!cancelled) {
					setSelectedFiles(files);
				}
			} catch (e: unknown) {
				if (!cancelled) {
					setError(String(e ?? 'Unknown error'));
				}
			} finally {
				if (!cancelled) {
					setLoading(false);
				}
			}
		})();

		return () => {
			cancelled = true;
		};
	}, [vault, metadata, settings, defaultPool]);

	return { selectedFiles, loading, error, reload };
}

