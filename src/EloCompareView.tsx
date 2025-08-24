import { StrictMode } from "react";
import { ItemView, WorkspaceLeaf } from "obsidian";
import { Root, createRoot } from "react-dom/client";
import { EloCompareComponent } from "./EloCompareComponent";
import { PluginInfo } from "main";

export const VIEW_TYPE_ELO = "elo-compare-view";

export class EloCompareView extends ItemView {
	root: Root | null = null;
	pluginInfo: PluginInfo;

	constructor(leaf: WorkspaceLeaf, pluginInfo: PluginInfo) {
		super(leaf);
		this.pluginInfo = pluginInfo;
	}

	getViewType() {
		return VIEW_TYPE_ELO;
	}

	getDisplayText() {
		return "Elo Compare";
	}

	async onOpen() {
		// Mount the React component into this view's content element
		this.root = createRoot(this.contentEl);
		this.root.render(
			<StrictMode>
				<EloCompareComponent pluginInfo={this.pluginInfo} />
			</StrictMode>
		);
	}

	async onClose() {
		// Clean up the React root
		this.root?.unmount();
		this.root = null;
	}
}
