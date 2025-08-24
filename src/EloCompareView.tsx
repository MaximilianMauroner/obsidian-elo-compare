import { StrictMode } from "react";
import { ItemView, Vault, WorkspaceLeaf } from "obsidian";
import { Root, createRoot } from "react-dom/client";
import { EloCompareComponent } from "./EloCompareComponent";

export const VIEW_TYPE_ELO = "elo-compare-view";

export class EloCompareView extends ItemView {
	root: Root | null = null;
	vault: Vault;

	constructor(leaf: WorkspaceLeaf, vault: Vault) {
		super(leaf);
		this.vault = vault;
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
				<EloCompareComponent vault={this.vault} />
			</StrictMode>
		);
	}

	async onClose() {
		// Clean up the React root
		this.root?.unmount();
		this.root = null;
	}
}
