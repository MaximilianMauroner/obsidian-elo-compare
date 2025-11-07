import type { SelectedFile, PluginInfo } from './types';
import { useCoverImage } from './hooks/useCoverImage';

interface DisplayEloItemProps {
	item?: SelectedFile;
	onChoose: () => void;
	onRemove?: () => void;
	pluginInfo: PluginInfo;
}

/**
 * Component that displays a single item for ELO comparison
 */
export const DisplayEloItem = ({
	item,
	onChoose,
	onRemove,
	pluginInfo,
}: DisplayEloItemProps) => {
	const coverImageUrl = useCoverImage(item?.frontmatter ?? null, item?.file, pluginInfo);

	const handleFileClick = (e: React.MouseEvent) => {
		if (!item?.file) return;
		e.preventDefault();
		pluginInfo.app.workspace.openLinkText(item.file.path, '', true);
	};

	return (
		<div className="callout" data-callout="quote" style={{ flex: 1, position: 'relative' }}>
			<div className="callout-title">
				<div className="callout-title-inner">
					{item?.file ? (
						<a
							href="#"
							className="internal-link"
							onClick={handleFileClick}
							style={{ textDecoration: 'none', color: 'inherit' }}
						>
							{item.name ?? item.file.path}
						</a>
					) : (
						item?.name ?? item?.file?.path
					)}
				</div>
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
				{item && onRemove && (
					<div
						style={{
							display: 'flex',
							gap: 8,
							marginTop: 6,
							marginBottom: 6,
						}}
					>
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
					</div>
				)}
				<button
					className="mod-cta"
					onClick={onChoose}
					title={item ? undefined : 'This item is unfinished. Remove or fix it.'}
				>
					Choose {item?.name ?? item?.file?.path}
				</button>
			</div>
		</div>
	);
};
