import { Editor, MarkdownView, Menu, Notice, Plugin, TFile, debounce } from 'obsidian';
import { McpClient } from './mcp-client';
import { IdeashellApi } from './ideashell-api';
import { SyncService } from './sync';
import { DEFAULT_SETTINGS, IdeashellSettingTab, IdeashellSettings, resolveEndpoint } from './settings';
import { FM_MARK } from './convert';

export default class IdeashellPlugin extends Plugin {
	settings: IdeashellSettings = DEFAULT_SETTINGS;
	api!: IdeashellApi;
	private client: McpClient | null = null;
	private sync!: SyncService;
	private statusEl: HTMLElement | null = null;
	private pendingAuto = new Map<string, ReturnType<typeof setTimeout>>();

	async onload(): Promise<void> {
		await this.loadSettings();
		this.api = new IdeashellApi(() => this.getClient());
		this.sync = new SyncService(this.app, this.api, () => this.settings);
		this.addSettingTab(new IdeashellSettingTab(this.app, this));
		this.statusEl = this.addStatusBarItem();

		this.addRibbonIcon('shell', 'Sync current note to ideashell', () => void this.syncActive());

		this.addCommand({
			id: 'sync-current-note',
			name: 'Sync current note to ideashell',
			checkCallback: (checking) => {
				const file = this.app.workspace.getActiveFile();
				if (!file || file.extension !== 'md') return false;
				if (!checking) void this.syncActive();
				return true;
			},
		});

		this.addCommand({
			id: 'send-selection',
			name: 'Send selection to ideashell as a new note',
			editorCheckCallback: (checking, editor: Editor, view) => {
				const sel = editor.getSelection();
				if (!sel.trim()) return false;
				if (!checking) void this.sync.syncSelection(sel, view.file ?? null);
				return true;
			},
		});

		this.addCommand({
			id: 'mark-current-note',
			name: 'Mark current note for ideashell sync (ideashell: true)',
			checkCallback: (checking) => {
				const file = this.app.workspace.getActiveFile();
				if (!file || file.extension !== 'md') return false;
				if (!checking) {
					void this.app.fileManager.processFrontMatter(file, (fm) => {
						fm[FM_MARK] = true;
					});
					new Notice(`ideashell: "${file.basename}" marked for sync`);
				}
				return true;
			},
		});

		this.addCommand({
			id: 'sync-all',
			name: 'Sync all marked notes and sync folders to ideashell',
			callback: () => void this.syncAll(),
		});

		this.registerEvent(
			this.app.workspace.on('file-menu', (menu: Menu, file) => {
				if (!(file instanceof TFile) || file.extension !== 'md') return;
				menu.addItem((item) =>
					item
						.setTitle('Sync to ideashell')
						.setIcon('shell')
						.onClick(() => void this.sync.syncFile(file)),
				);
			}),
		);

		this.registerEvent(
			this.app.workspace.on('editor-menu', (menu: Menu, editor: Editor, view) => {
				if (!editor.getSelection().trim()) return;
				menu.addItem((item) =>
					item
						.setTitle('Send selection to ideashell')
						.setIcon('shell')
						.onClick(() => void this.sync.syncSelection(editor.getSelection(), view.file ?? null)),
				);
			}),
		);

		// Auto re-sync: only notes that were synced before, only when enabled, debounced per file.
		this.registerEvent(
			this.app.vault.on('modify', (file) => {
				if (!this.settings.autoSyncSynced) return;
				if (!(file instanceof TFile) || file.extension !== 'md') return;
				if (!this.sync.isSynced(file)) return;
				this.scheduleAutoSync(file);
			}),
		);

		this.registerEvent(
			this.app.workspace.on('active-leaf-change', () => this.refreshStatus()),
		);
		this.registerEvent(this.app.metadataCache.on('changed', (file) => {
			if (file === this.app.workspace.getActiveFile()) this.refreshStatus();
		}));
		this.refreshStatus();
	}

	onunload(): void {
		for (const t of this.pendingAuto.values()) clearTimeout(t);
		this.pendingAuto.clear();
	}

	// --- helpers ---

	getClient(): McpClient {
		if (!this.client) {
			this.client = new McpClient(resolveEndpoint(this.settings), this.settings.accessKey, this.manifest.version);
		}
		return this.client;
	}

	resetClient(): void {
		this.client = null;
		this.sync?.invalidateFolders();
	}

	private async syncActive(): Promise<void> {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		const file = this.app.workspace.getActiveFile();
		if (!file || file.extension !== 'md') {
			new Notice('ideashell: open a markdown note first');
			return;
		}
		// flush unsaved editor content so we read what the user sees
		if (view?.file === file) await view.save();
		await this.sync.syncFile(file);
		this.refreshStatus();
	}

	private async syncAll(): Promise<void> {
		const files = this.sync.collectSyncTargets();
		if (files.length === 0) {
			new Notice('ideashell: nothing to sync. Mark notes with `ideashell: true` or configure sync folders.');
			return;
		}
		const notice = new Notice(`ideashell: syncing 0/${files.length}…`, 0);
		const counts = await this.sync.syncMany(files, (done, total) => notice.setMessage(`ideashell: syncing ${done}/${total}…`));
		notice.hide();
		new Notice(
			`ideashell: ${counts.created} created, ${counts.updated} updated, ${counts.unchanged} unchanged, ${counts.failed} failed`,
			8000,
		);
		this.refreshStatus();
	}

	private scheduleAutoSync(file: TFile): void {
		const prev = this.pendingAuto.get(file.path);
		if (prev) clearTimeout(prev);
		this.pendingAuto.set(
			file.path,
			setTimeout(() => {
				this.pendingAuto.delete(file.path);
				void this.sync.syncFile(file, { silent: true }).then((r) => {
					if (r === 'updated') new Notice(`ideashell: "${file.basename}" updated`, 2000);
					this.refreshStatus();
				});
			}, this.settings.autoSyncDelay * 1000),
		);
	}

	private refreshStatus = debounce(() => {
		if (!this.statusEl) return;
		const file = this.app.workspace.getActiveFile();
		if (!file || file.extension !== 'md') {
			this.statusEl.setText('');
			return;
		}
		this.statusEl.setText(this.sync.isSynced(file) ? 'ideashell ✓' : '');
	}, 200, true);

	async loadSettings(): Promise<void> {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, (await this.loadData()) as Partial<IdeashellSettings>);
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}
}
