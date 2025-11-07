import { App, Plugin, PluginSettingTab, Setting, TextComponent, ButtonComponent } from 'obsidian';
import { FolderSuggestModal } from 'src/FolderSuggestModal';
import { EloCompareView, VIEW_TYPE_ELO } from 'src/EloCompareView';
import type { EloCompareSettings, PluginInfo, ComparisonTypeConfig } from 'src/types';
import { deleteTypeStorage } from 'src/storage';

export const DEFAULT_SETTINGS: EloCompareSettings = {
	defaultComparisonType: 'default',
	typeConfigs: {
		default: {
			name: 'default',
			displayName: 'Default',
			defaultFolder: '',
			frontmatterProperty: 'rating',
			includeSubfolders: false,
		},
	},
};

export type { EloCompareSettings, PluginInfo };

export default class EloCompare extends Plugin {
	settings: EloCompareSettings;

	async onload() {
		await this.loadSettings();

		// Register the React-based EloCompare view
		this.registerView(
			VIEW_TYPE_ELO,
			(leaf) =>
				new EloCompareView(leaf, {
					vault: this.app.vault,
					settings: this.settings,
					metadata: this.app.metadataCache,
					app: this.app,
					plugin: this,
				})
		);

		// This creates an icon in the left ribbon.
		const ribbonIconEl = this.addRibbonIcon(
			'dice',
			'Start Elo Compare',
			async (evt: MouseEvent) => {
				// Open the Elo compare modal when the ribbon icon is clicked
				const leaf = this.app.workspace.getLeaf(false);
				await leaf.setViewState({ type: VIEW_TYPE_ELO });
				this.app.workspace.revealLeaf(leaf);
			}
		);

		// Command to open the React-based Elo Compare view
		this.addCommand({
			id: 'start-elo-compare',
			name: 'Start elo compare',
			callback: async () => {
				const leaf = this.app.workspace.getLeaf(false);
				await leaf.setViewState({ type: VIEW_TYPE_ELO });
				this.app.workspace.revealLeaf(leaf);
			},
		});
		// Perform additional things with the ribbon
		ribbonIconEl.addClass('my-plugin-ribbon-class');
		// This adds a complex command that can check whether the current state of the app allows execution of the command

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new EloCompareSettingTab(this.app, this));
	}

	onunload() {}

	async loadSettings() {
		const loaded = await this.loadData();
		this.settings = Object.assign({}, DEFAULT_SETTINGS, loaded);

		// Ensure typeConfigs exists
		if (!this.settings.typeConfigs) {
			this.settings.typeConfigs = {};
		}

		// Ensure default type config exists
		if (!this.settings.typeConfigs['default']) {
			this.settings.typeConfigs['default'] = {
				name: 'default',
				displayName: 'Default',
				defaultFolder: '',
				frontmatterProperty: 'rating',
				includeSubfolders: false,
			};
		}

		// Ensure all type configs have displayName
		for (const [typeId, config] of Object.entries(this.settings.typeConfigs)) {
			if (!config.displayName) {
				config.displayName =
					typeId.charAt(0).toUpperCase() + typeId.slice(1).replace(/-/g, ' ');
			}
		}

		// Ensure defaultComparisonType is set
		if (!this.settings.defaultComparisonType) {
			this.settings.defaultComparisonType = 'default';
		}
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class EloCompareSettingTab extends PluginSettingTab {
	plugin: EloCompare;

	constructor(app: App, plugin: EloCompare) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		// Ensure settings are properly initialized
		this.ensureSettingsInitialized();

		containerEl.createEl('h2', { text: 'Comparison Types' });
		containerEl.createEl('p', {
			text: 'Configure different types of comparisons (e.g., books, movies). Each type has its own settings and ELO ratings.',
			cls: 'setting-item-description',
		});

		// Display all comparison type configurations
		this.renderTypeConfigs(containerEl);

		// Add new type button
		new Setting(containerEl)
			.setName('Add new comparison type')
			.setDesc('Create a new comparison type configuration')
			.addButton((button: ButtonComponent) => {
				button
					.setButtonText('Add Type')
					.setCta()
					.onClick(() => {
						this.showAddTypeModal();
					});
			});
	}

	private ensureSettingsInitialized(): void {
		// Ensure typeConfigs exists
		if (!this.plugin.settings.typeConfigs) {
			this.plugin.settings.typeConfigs = {};
		}

		// Ensure default type config exists
		if (!this.plugin.settings.typeConfigs['default']) {
			this.plugin.settings.typeConfigs['default'] = {
				name: 'default',
				displayName: 'Default',
				defaultFolder: '',
				frontmatterProperty: 'rating',
				includeSubfolders: false,
			};
		}

		// Ensure all type configs have displayName
		for (const [typeId, config] of Object.entries(this.plugin.settings.typeConfigs)) {
			if (!config.displayName) {
				config.displayName =
					typeId.charAt(0).toUpperCase() + typeId.slice(1).replace(/-/g, ' ');
			}
		}

		// Ensure defaultComparisonType is set
		if (!this.plugin.settings.defaultComparisonType) {
			this.plugin.settings.defaultComparisonType = 'default';
		}
	}

	private renderTypeConfigs(containerEl: HTMLElement): void {
		const typeConfigs = this.plugin.settings.typeConfigs || {};
		const types = Object.keys(typeConfigs).sort();

		if (types.length === 0) {
			containerEl.createEl('p', {
				text: 'No comparison types configured. Click "Add Type" to create one.',
				cls: 'setting-item-description',
			});
			return;
		}

		types.forEach((typeName) => {
			const config = typeConfigs[typeName];
			if (config) {
				this.renderTypeConfig(containerEl, typeName, config);
			}
		});
	}

	private renderTypeConfig(
		containerEl: HTMLElement,
		typeName: string,
		config: ComparisonTypeConfig
	): void {
		if (!config) {
			console.warn(`Config missing for type: ${typeName}`);
			return;
		}

		const typeSection = containerEl.createDiv('type-config-section');
		typeSection.style.border = '1px solid var(--background-modifier-border)';
		typeSection.style.borderRadius = '4px';
		typeSection.style.padding = '12px';
		typeSection.style.marginBottom = '12px';

		// Header with type name and delete button
		const header = typeSection.createDiv();
		header.style.display = 'flex';
		header.style.justifyContent = 'space-between';
		header.style.alignItems = 'center';
		header.style.marginBottom = '12px';

		const displayName = config.displayName || typeName;
		const typeNameEl = header.createEl('h3', { text: displayName });
		typeNameEl.style.margin = '0';
		typeNameEl.style.flex = '1';

		const isDefault = this.plugin.settings.defaultComparisonType === typeName;
		if (isDefault) {
			const defaultBadge = header.createSpan({ text: 'Default', cls: 'tag' });
			defaultBadge.style.marginRight = '8px';
		}

		const deleteButton = header.createEl('button', { text: 'Delete' });
		deleteButton.className = 'mod-warning';
		deleteButton.style.fontSize = '0.9em';
		deleteButton.style.padding = '4px 8px';
		deleteButton.onclick = async () => {
			if (
				await this.confirmDelete(
					typeName,
					Object.keys(this.plugin.settings.typeConfigs || {}).length
				)
			) {
				await this.deleteType(typeName);
				this.display(); // Refresh the settings view
			}
		};

		// Set as default button
		if (!isDefault) {
			const setDefaultButton = header.createEl('button', { text: 'Set as Default' });
			setDefaultButton.style.fontSize = '0.9em';
			setDefaultButton.style.padding = '4px 8px';
			setDefaultButton.style.marginRight = '8px';
			setDefaultButton.onclick = async () => {
				this.plugin.settings.defaultComparisonType = typeName;
				await this.plugin.saveSettings();
				this.display(); // Refresh the settings view
			};
		}

		// Display name setting
		new Setting(typeSection)
			.setName('Display name')
			.setDesc('User-friendly name for this comparison type (e.g., "Books", "Movies")')
			.addText((text) => {
				text.setValue(config.displayName || typeName)
					.setPlaceholder('e.g., Books, Movies')
					.onChange(async (value) => {
						config.displayName = value.trim() || typeName;
						await this.plugin.saveSettings();
						// Update the header display name
						typeNameEl.textContent = config.displayName || typeName;
					});
				return text;
			});

		// Type name setting (internal identifier)
		new Setting(typeSection)
			.setName('Type ID')
			.setDesc('Internal identifier for this comparison type (used for storage)')
			.addText((text) => {
				text.setValue(config.name)
					.setPlaceholder('e.g., books, movies')
					.onChange(async (value) => {
						const sanitized = value
							.trim()
							.toLowerCase()
							.replace(/[^a-z0-9-_]/g, '-');
						if (sanitized && sanitized !== typeName) {
							// Rename the type
							await this.renameType(typeName, sanitized);
							this.display(); // Refresh
						} else if (sanitized) {
							config.name = sanitized;
							await this.plugin.saveSettings();
						}
					});
				return text;
			});

		// Default folder setting
		const folderSetting = new Setting(typeSection)
			.setName('Default folder')
			.setDesc('Default folder to use for this comparison type')
			.addText((text) => {
				text.setPlaceholder('Leave empty for root')
					.setValue(config.defaultFolder || '')
					.onChange(async (value) => {
						config.defaultFolder = value;
						await this.plugin.saveSettings();
					});
				return text;
			})
			.addButton((btn) =>
				btn.setButtonText('Browse').onClick(() => {
					new FolderSuggestModal(this.app, async (chosenPath: string) => {
						config.defaultFolder = chosenPath;
						const textComp = folderSetting.components[0] as TextComponent | undefined;
						if (textComp) textComp.setValue(chosenPath);
						await this.plugin.saveSettings();
					}).open();
				})
			);

		// Frontmatter property setting
		new Setting(typeSection)
			.setName('Frontmatter property')
			.setDesc('Frontmatter property name to filter files for this type')
			.addText((text) => {
				text.setPlaceholder('e.g., rating, book-rating')
					.setValue(config.frontmatterProperty || 'rating')
					.onChange(async (value) => {
						config.frontmatterProperty = value || 'rating';
						await this.plugin.saveSettings();
					});
				return text;
			});

		// Include subfolders setting
		new Setting(typeSection)
			.setName('Include subfolders')
			.setDesc('Include subfolders when searching for files')
			.addToggle((toggle) => {
				toggle.setValue(!!config.includeSubfolders).onChange(async (value) => {
					config.includeSubfolders = value;
					await this.plugin.saveSettings();
				});
			});
	}

	private async showAddTypeModal(): Promise<void> {
		// Ensure settings are initialized
		this.ensureSettingsInitialized();

		// Simple prompt for type name
		const name = 'new-type';
		const typeConfigs = this.plugin.settings.typeConfigs || {};
		if (typeConfigs[name]) {
			alert('A comparison type with this name already exists');
			return;
		}
		// Get default values from existing default type
		const defaultConfig = typeConfigs['default'] || {
			name: 'default',
			displayName: 'Default',
			defaultFolder: '',
			frontmatterProperty: 'rating',
			includeSubfolders: false,
		};

		// Create display name from sanitized name
		const displayName = name.charAt(0).toUpperCase() + name.slice(1);

		// Create new type config
		typeConfigs[name] = {
			name: name,
			displayName: displayName,
			defaultFolder: defaultConfig.defaultFolder,
			frontmatterProperty: defaultConfig.frontmatterProperty,
			includeSubfolders: defaultConfig.includeSubfolders,
		};

		// No need to maintain comparisonTypes array - we derive it from typeConfigs keys

		this.plugin.settings.typeConfigs = typeConfigs;
		await this.plugin.saveSettings();
		this.display(); // Refresh the settings view
	}

	private async renameType(oldName: string, newName: string): Promise<void> {
		if (oldName === newName) return;

		const typeConfigs = this.plugin.settings.typeConfigs || {};
		if (typeConfigs[newName]) {
			alert('A comparison type with this name already exists');
			return;
		}

		// Move config and update name
		const oldConfig = typeConfigs[oldName];
		typeConfigs[newName] = {
			...oldConfig,
			name: newName,
			displayName:
				oldConfig.displayName ||
				newName.charAt(0).toUpperCase() + newName.slice(1).replace(/-/g, ' '),
		};
		delete typeConfigs[oldName];

		// No need to maintain comparisonTypes array - we derive it from typeConfigs keys

		// Update defaultComparisonType if needed
		if (this.plugin.settings.defaultComparisonType === oldName) {
			this.plugin.settings.defaultComparisonType = newName;
		}

		// Note: We don't rename storage files here - that would require moving files
		// For now, users should manually handle this or we could add a migration function

		this.plugin.settings.typeConfigs = typeConfigs;
		await this.plugin.saveSettings();
	}

	private async confirmDelete(typeName: string, totalTypes: number): Promise<boolean> {
		if (totalTypes <= 1) {
			alert('Cannot delete the last comparison type');
			return false;
		}

		return confirm(
			`Delete comparison type "${typeName}"? All ratings and history for this type will be lost. This action cannot be undone.`
		);
	}

	private async deleteType(typeName: string): Promise<void> {
		// Delete storage files
		await deleteTypeStorage(this.app.vault, typeName);

		// Remove from typeConfigs
		const typeConfigs = this.plugin.settings.typeConfigs || {};
		delete typeConfigs[typeName];
		this.plugin.settings.typeConfigs = typeConfigs;

		// Update defaultComparisonType if needed
		if (this.plugin.settings.defaultComparisonType === typeName) {
			const remainingTypes = Object.keys(typeConfigs);
			this.plugin.settings.defaultComparisonType =
				remainingTypes.length > 0 ? remainingTypes[0] : 'default';
		}

		await this.plugin.saveSettings();
	}
}
