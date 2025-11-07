import type { SelectedFile, PluginInfo } from '../types';

interface FileListProps {
	items: SelectedFile[];
	pluginInfo: PluginInfo;
}

/**
 * Displays a list of all loaded files with their ratings
 */
export function FileList({ items, pluginInfo }: FileListProps) {
	if (items.length === 0) {
		return null;
	}

	return (
		<details style={{ marginBottom: 12 }}>
			<summary style={{ cursor: 'pointer' }}>Show files ({items.length})</summary>
			<div className="callout" data-callout="info" style={{ marginTop: 8 }}>
				<div className="callout-content">
					<ul style={{ margin: 0, paddingLeft: 20 }}>
						{items.map((sf) => (
							<li key={sf.file.path}>
								<a
									href="#"
									className="internal-link"
									onClick={(e) => {
										e.preventDefault();
										pluginInfo.app.workspace.openLinkText(sf.file.path, '', true);
									}}
								>
									{sf.name}
								</a>
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
	);
}

