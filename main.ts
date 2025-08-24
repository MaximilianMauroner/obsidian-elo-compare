import { App, Plugin, PluginSettingTab, Setting, ToggleComponent, TextComponent, MetadataCache, Vault } from 'obsidian';
import { FolderSuggestModal } from 'src/FolderSuggestModal';
import { EloCompareView, VIEW_TYPE_ELO } from 'src/EloCompareView';

// Remember to rename these classes and interfaces!

export type EloCompareSettings = {
	mySetting: string;
	includeSubfoldersByDefault?: boolean;
	defaultFolder: string;
	frontmatterProperty: string;
}

export const DEFAULT_SETTINGS: EloCompareSettings = {
	mySetting: 'default',
	includeSubfoldersByDefault: false,
	defaultFolder: '',
	frontmatterProperty: "rating"
}

export type PluginInfo = {
	vault: Vault,
	settings: EloCompareSettings
	metadata: MetadataCache
}

export default class EloCompare extends Plugin {
	settings: EloCompareSettings;

	async onload() {
		await this.loadSettings();

		// Register the React-based EloCompare view
		this.registerView(VIEW_TYPE_ELO, (leaf) => new EloCompareView(leaf, {
			vault: this.app.vault,
			settings: this.settings,
			metadata: this.app.metadataCache
		}));

		// This creates an icon in the left ribbon.
		const ribbonIconEl = this.addRibbonIcon('dice', 'Start Elo Compare', async (evt: MouseEvent) => {
			// Open the Elo compare modal when the ribbon icon is clicked
			const leaf = this.app.workspace.getLeaf(false);
			await leaf.setViewState({ type: VIEW_TYPE_ELO });
			this.app.workspace.revealLeaf(leaf);
		});

		// Command to open the React-based Elo Compare view
		this.addCommand({
			id: 'start-elo-compare',
			name: 'Start elo compare',
			callback: async () => {
				// Ensure a default folder is configured in settings before opening the view.
				const openView = async () => {
					const leaf = this.app.workspace.getLeaf(false);
					await leaf.setViewState({ type: VIEW_TYPE_ELO });
					this.app.workspace.revealLeaf(leaf);
				};

				if (!this.settings || !this.settings.defaultFolder) {
					// Prompt the user to pick a folder first
					new FolderSuggestModal(this.app, async (chosenPath: string) => {
						// Save chosen folder to settings and then open the view
						this.settings.defaultFolder = chosenPath;
						await this.saveSettings();
						await openView();
					}).open();
					return;
				}

				// Settings already configured, just open the view
				await openView();
			}
		});
		// Perform additional things with the ribbon
		ribbonIconEl.addClass('my-plugin-ribbon-class');
		// This adds a complex command that can check whether the current state of the app allows execution of the command

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new EloCompareSettingTab(this.app, this));
	}

	onunload() {

	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
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

		// New settings for Elo plugin UI
		const includeSubToggleSetting = new Setting(containerEl)
			.setName('Include subfolders by default')
			.setDesc('When opening the Elo modal, include subfolders automatically')
			.addToggle(toggle => toggle
				.setValue(!!this.plugin.settings.includeSubfoldersByDefault)
				.onChange(async (value) => {
					this.plugin.settings.includeSubfoldersByDefault = value;
					await this.plugin.saveSettings();
				}))
			.addExtraButton(button => button
				.setIcon('reset')
				.setTooltip('Reset to default')
				.onClick(async () => {
					this.plugin.settings.includeSubfoldersByDefault = !!DEFAULT_SETTINGS.includeSubfoldersByDefault;
					await this.plugin.saveSettings();
					const t = includeSubToggleSetting.components[0] as ToggleComponent | undefined;
					if (t) t.setValue(!!DEFAULT_SETTINGS.includeSubfoldersByDefault);
				}));

		const defaultFolderSetting = new Setting(containerEl)
			.setName('Default folder for Elo')
			.setDesc('A default folder to preselect when opening the Elo modal')
			.addText(text => {
				text
					.setPlaceholder('Leave empty for root')
					.setValue(this.plugin.settings.defaultFolder || '')
					.onChange(async (value) => {
						this.plugin.settings.defaultFolder = value;
						await this.plugin.saveSettings();
					});
				return text;
			})
			.addButton(btn => btn
				.setButtonText('Browse')
				.onClick(() => {
					new FolderSuggestModal(this.app, async (chosenPath: string) => {
						this.plugin.settings.defaultFolder = chosenPath;
						const textComp = defaultFolderSetting.components[0] as TextComponent | undefined;
						if (textComp) textComp.setValue(chosenPath);
						await this.plugin.saveSettings();
					}).open();
				}))
			.addExtraButton(button => button
				.setIcon('reset')
				.setTooltip('Reset to default')
				.onClick(async () => {
					this.plugin.settings.defaultFolder = DEFAULT_SETTINGS.defaultFolder || '';
					await this.plugin.saveSettings();
					const textComp = defaultFolderSetting.components[0] as TextComponent | undefined;
					if (textComp) textComp.setValue(DEFAULT_SETTINGS.defaultFolder || '');
				}));
	}
}
