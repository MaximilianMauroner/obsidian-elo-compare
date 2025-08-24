import { EloCompareSettings } from "main";
import { App, Modal, Notice, TFile } from "obsidian";
import { FolderSuggestModal } from "./FolderSuggestModal";

export class EloCompareModal extends Modal {
    private defaults?: EloCompareSettings;

    constructor(app: App, defaults?: EloCompareSettings) {
        super(app);
        this.defaults = defaults;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        contentEl.createEl('h2', { text: 'Elo Compare — Select a folder' });

        // Build list of folders from all files in the vault
        const files: TFile[] = this.app.vault.getFiles();
        const folderSet = new Set<string>();
        files.forEach((f) => {
            const idx = f.path.lastIndexOf('/');
            const folder = idx === -1 ? '' : f.path.substring(0, idx);
            folderSet.add(folder);
        });

        const folders = Array.from(folderSet).sort((a, b) => a.localeCompare(b));

        // Native select element (shows a native dropdown/list)
        const select = contentEl.createEl('select');
        select.style.display = 'block';
        select.size = 8; // show multiple entries in native control
        select.style.width = '100%';
        select.style.marginBottom = '8px';

        // Add an option for root (empty string)
        const rootOption = select.createEl('option', { text: '(root)' });
        rootOption.value = '';



        // Fuzzy folder picker button
        const fuzzyBtn = contentEl.createEl('button', { text: 'Pick folder (fuzzy)' });
        fuzzyBtn.style.margin = '0 8px 8px 0';
        fuzzyBtn.addEventListener('click', (e) => {
            e.preventDefault();
            new FolderSuggestModal(this.app, (chosen: string) => {
                // set select to chosen (if option exists) or add it
                let found = false;
                for (let i = 0; i < select.options.length; i++) {
                    if (select.options[i].value === chosen) {
                        select.selectedIndex = i;
                        found = true;
                        break;
                    }
                }
                if (!found) {
                    const opt = select.createEl('option', { text: chosen || '(root)' });
                    opt.value = chosen;
                    select.selectedIndex = select.options.length - 1;
                }
            });
        });

        folders.forEach((folder) => {
            const opt = select.createEl('option', { text: folder || '(root)' });
            opt.value = folder;
        });

        // Include subfolders checkbox
        const includeLabel = contentEl.createEl('label');
        includeLabel.style.display = 'block';
        includeLabel.style.marginBottom = '6px';
        const includeCheckbox = includeLabel.createEl('input');
        includeCheckbox.type = 'checkbox';
        includeCheckbox.style.marginRight = '6px';
        includeLabel.appendText('Include subfolders');


        // Preselect defaults from provided settings object if present
        if (this.defaults) {
            const defFolder = this.defaults.defaultFolder || '';
            if (defFolder) {
                let exists = false;
                for (let i = 0; i < select.options.length; i++) {
                    if (select.options[i].value === defFolder) { select.selectedIndex = i; exists = true; break; }
                }
                if (!exists) {
                    const opt = select.createEl('option', { text: defFolder });
                    opt.value = defFolder;
                    select.selectedIndex = select.options.length - 1;
                }
            }
            if (this.defaults.includeSubfoldersByDefault) {
                includeCheckbox.checked = true;
            }
        }

        const btn = contentEl.createEl('button', { text: 'Load files from folder' });
        btn.style.display = 'block';
        btn.style.margin = '8px 0 12px 0';

        const listEl = contentEl.createDiv();

        btn.addEventListener('click', async (e) => {
            e.preventDefault();
            const chosen = select.value; // '' means root
            // Find files whose folder matches chosen
            const includeSub = includeCheckbox.checked;
            const matched = files.filter((f) => {
                const idx = f.path.lastIndexOf('/');
                const folder = idx === -1 ? '' : f.path.substring(0, idx);
                if (includeSub) {
                    // If chosen is root (''), include everything; otherwise include files whose folder is
                    // the chosen folder or any nested folder (startsWith).
                    if (chosen === '') return true;
                    return folder === chosen || folder.startsWith(chosen + '/');
                } else {
                    return folder === chosen;
                }
            });

            listEl.empty();
            if (matched.length === 0) {
                listEl.createEl('p', { text: 'No files found in this folder.' });
                new Notice('No files found in selected folder');
                return;
            }

            const ul = listEl.createEl('ul');
            matched.forEach((f) => {
                const li = ul.createEl('li');
                const a = li.createEl('a', { text: f.name });
                a.href = '#';
                a.addEventListener('click', async (ev) => {
                    ev.preventDefault();
                    const leaf = this.app.workspace.getLeaf();
                    await leaf.openFile(f);
                });
                // show relative path next to name for clarity
                li.createSpan({ text: ` — ${f.path}`, cls: 'mod-quiet' });
            });
            new Notice(`Loaded ${matched.length} files from folder`);
        });

        // Insert fuzzy button before load button
        btn.parentElement?.insertBefore(fuzzyBtn, btn);
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}