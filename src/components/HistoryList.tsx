import type { HistoryType, PluginInfo } from '../types';

interface HistoryListProps {
	history: HistoryType[];
	pluginInfo: PluginInfo;
}

/**
 * Renders a clickable file link that opens in Obsidian
 */
function FileLink({
	file,
	name,
	pluginInfo,
}: {
	file: { path: string };
	name: string;
	pluginInfo: PluginInfo;
}) {
	return (
		<a
			href="#"
			className="internal-link"
			onClick={(e) => {
				e.preventDefault();
				pluginInfo.app.workspace.openLinkText(file.path, '', true);
			}}
		>
			{name}
		</a>
	);
}

/**
 * Renders a single history entry
 */
function HistoryEntry({ entry, pluginInfo }: { entry: HistoryType; pluginInfo: PluginInfo }) {
	return (
		<li>
			<span>
				<FileLink file={entry.winner.file} name={entry.winner.name} pluginInfo={pluginInfo} />
			</span>
			{' beat '}
			<span>
				<FileLink file={entry.loser.file} name={entry.loser.name} pluginInfo={pluginInfo} />
			</span>
			{' — ('}
			<span>
				<FileLink
					file={entry.winner.file}
					name={entry.winner.name}
					pluginInfo={pluginInfo}
				/>
			</span>
			{`: ${entry.winnerOldRating} → ${entry.winnerNewRating}, `}
			<span>
				<FileLink file={entry.loser.file} name={entry.loser.name} pluginInfo={pluginInfo} />
			</span>
			{`: ${entry.loserOldRating} → ${entry.loserNewRating})`}
		</li>
	);
}

/**
 * Displays the comparison history
 */
export function HistoryList({ history, pluginInfo }: HistoryListProps) {
	if (history.length === 0) {
		return <div className="mod-muted">No comparisons yet.</div>;
	}

	return (
		<ul>
			{history.map((entry, i) => (
				<HistoryEntry key={i} entry={entry} pluginInfo={pluginInfo} />
			))}
		</ul>
	);
}

