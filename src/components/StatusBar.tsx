import type { PluginInfo, SelectedFile, ComparisonTypeConfig } from '../types';

interface StatusBarProps {
	loadingSelectedFiles: boolean;
	selectedFilesError: string | null;
	items: SelectedFile[];
	typeConfig: ComparisonTypeConfig;
	onReset: () => void;
}

/**
 * Displays the status bar with file count and reset button
 */
export function StatusBar({
	loadingSelectedFiles,
	selectedFilesError,
	items,
	typeConfig,
	onReset,
}: StatusBarProps) {
	return (
		<div className="callout" data-callout="note" style={{ marginBottom: 8 }}>
			<div className="callout-content">
				{loadingSelectedFiles ? (
					<span>Loading files…</span>
				) : selectedFilesError ? (
					<span className="mod-warning">Error: {selectedFilesError}</span>
				) : items.length > 0 ? (
					<div
						style={{
							display: 'flex',
							justifyContent: 'space-between',
							alignItems: 'center',
						}}
					>
						<span className="mod-muted">
							{items.length} file(s) loaded from "
							{typeConfig.defaultFolder || 'all folders'}"
						</span>
						<div style={{ display: 'flex', gap: 8 }}>
							<button className="mod-warning" onClick={onReset}>
								Reset
							</button>
						</div>
					</div>
				) : (
					<span className="mod-muted">No files loaded</span>
				)}
			</div>
		</div>
	);
}

