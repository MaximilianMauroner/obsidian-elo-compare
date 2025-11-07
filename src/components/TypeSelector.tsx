import { useState } from 'react';
import type { EloCompareSettings, PluginInfo } from '../types';
import { deleteTypeStorage } from '../storage';

interface TypeSelectorProps {
	currentType: string;
	settings: EloCompareSettings;
	pluginInfo: PluginInfo;
	onTypeChange: (type: string) => void;
	onSettingsUpdate: (settings: EloCompareSettings) => Promise<void>;
}

/**
 * Component for selecting and managing comparison types
 */
export function TypeSelector({
	currentType,
	settings,
	pluginInfo,
	onTypeChange,
	onSettingsUpdate,
}: TypeSelectorProps) {
	const [isCreating, setIsCreating] = useState(false);
	const [newTypeName, setNewTypeName] = useState('');
	const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);

	// Derive types from typeConfigs keys
	const types = Object.keys(settings.typeConfigs || {}).length > 0
		? Object.keys(settings.typeConfigs || {})
		: ['default'];
	const canDelete = types.length > 1;

	// Get display names for types
	const getDisplayName = (typeId: string): string => {
		const typeConfigs = settings.typeConfigs || {};
		const config = typeConfigs[typeId];
		return config?.displayName || typeId;
	};

	const handleCreateType = async () => {
		if (!newTypeName.trim()) return;

		const sanitized = newTypeName
			.trim()
			.toLowerCase()
			.replace(/[^a-z0-9-_]/g, '-');
		if (!sanitized || types.includes(sanitized)) {
			alert('Invalid type name or type already exists');
			return;
		}

		// Get default config from current type or default
		const typeConfigs = settings.typeConfigs || {};
		const currentConfig = typeConfigs[currentType] || typeConfigs['default'] || {
			name: 'default',
			displayName: 'Default',
			defaultFolder: '',
			frontmatterProperty: 'rating',
			includeSubfolders: false,
		};

		// Create display name from sanitized name
		const displayName =
			sanitized.charAt(0).toUpperCase() + sanitized.slice(1).replace(/-/g, ' ');

		// Create new type config
		const newTypeConfigs = {
			...typeConfigs,
			[sanitized]: {
				name: sanitized,
				displayName: displayName,
				defaultFolder: currentConfig.defaultFolder,
				frontmatterProperty: currentConfig.frontmatterProperty,
				includeSubfolders: currentConfig.includeSubfolders,
			},
		};

		await onSettingsUpdate({
			...settings,
			typeConfigs: newTypeConfigs,
			defaultComparisonType: sanitized,
		});

		setNewTypeName('');
		setIsCreating(false);
		onTypeChange(sanitized);
	};

	const handleDeleteType = async (typeToDelete: string) => {
		if (types.length <= 1) {
			alert('Cannot delete the last comparison type');
			return;
		}

		// Delete storage files for this type
		await deleteTypeStorage(pluginInfo.vault, typeToDelete);

		// Remove from typeConfigs
		const typeConfigs = { ...(settings.typeConfigs || {}) };
		delete typeConfigs[typeToDelete];
		
		// Get new default from remaining types
		const remainingTypes = Object.keys(typeConfigs);
		const newDefault = remainingTypes.length > 0 ? remainingTypes[0] : 'default';
		
		await onSettingsUpdate({
			...settings,
			typeConfigs: typeConfigs,
			defaultComparisonType: newDefault,
		});

		if (currentType === typeToDelete) {
			onTypeChange(newDefault);
		}

		setShowDeleteConfirm(null);
	};

	return (
		<div style={{ marginBottom: 12 }}>
			<div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
				<label style={{ fontWeight: 'bold' }}>Comparison Type:</label>
				<select
					value={currentType}
					onChange={(e) => onTypeChange(e.target.value)}
					style={{ flex: 1, maxWidth: 200 }}
				>
					{types.map((type) => (
						<option key={type} value={type}>
							{getDisplayName(type)}
						</option>
					))}
				</select>
				{canDelete && (
					<button
						className="mod-warning"
						onClick={() => setShowDeleteConfirm(currentType)}
						style={{ fontSize: '0.9em', padding: '4px 8px' }}
					>
						Delete
					</button>
				)}
				<button
					onClick={() => setIsCreating(!isCreating)}
					style={{ fontSize: '0.9em', padding: '4px 8px' }}
				>
					{isCreating ? 'Cancel' : '+ New'}
				</button>
			</div>

			{isCreating && (
				<div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
					<input
						type="text"
						value={newTypeName}
						onChange={(e) => setNewTypeName(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === 'Enter') {
								handleCreateType();
							} else if (e.key === 'Escape') {
								setIsCreating(false);
								setNewTypeName('');
							}
						}}
						placeholder="Type name (e.g., books, movies)"
						style={{ flex: 1, maxWidth: 200 }}
					/>
					<button onClick={handleCreateType}>Create</button>
				</div>
			)}

			{showDeleteConfirm && (
				<div className="callout" data-callout="warning" style={{ marginBottom: 8 }}>
					<div className="callout-content">
						<p>
							Delete comparison type "{getDisplayName(showDeleteConfirm)}"? All
							ratings and history for this type will be lost.
						</p>
						<div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
							<button
								className="mod-warning"
								onClick={() => handleDeleteType(showDeleteConfirm)}
							>
								Confirm Delete
							</button>
							<button onClick={() => setShowDeleteConfirm(null)}>Cancel</button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
