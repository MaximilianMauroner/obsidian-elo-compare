import { App, FuzzySuggestModal } from "obsidian";
export class FolderSuggestModal extends FuzzySuggestModal<string> {
    private onChooseFn: (folder: string) => void;

    constructor(app: App, onChoose: (folder: string) => void) {
        super(app);
        this.onChooseFn = onChoose;
    }

    getItems(): string[] {
        const files = this.app.vault.getFiles();
        const folderSet = new Set<string>();
        files.forEach((f) => {
            const idx = f.path.lastIndexOf('/');
            const folder = idx === -1 ? '' : f.path.substring(0, idx);
            folderSet.add(folder);
        });
        return Array.from(folderSet).sort((a, b) => a.localeCompare(b));
    }

    getItemText(item: string): string {
        return item || '(root)';
    }

    onChooseItem(item: string): void {
        this.onChooseFn(item);
    }
}
