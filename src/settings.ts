import { App, Notice, PluginSettingTab, Setting } from 'obsidian';
import type IdeashellPlugin from './main';

export type Region = 'cn' | 'global' | 'custom';

export const REGION_ENDPOINTS: Record<Exclude<Region, 'custom'>, string> = {
	cn: 'https://api.ideashell.cn/ideashell/mcp',
	global: 'https://api.ideashell.com/ideashell/mcp',
};

export interface IdeashellSettings {
	region: Region;
	customEndpoint: string;
	accessKey: string;
	/** Tag added to every note sent from Obsidian (empty = none). */
	sourceTag: string;
	/** Map the Obsidian parent folder of a note to an ideashell folder. */
	mapFolders: boolean;
	/** Only Obsidian folders under these paths are synced by "Sync all"; empty = whole vault (marked notes only). */
	syncFolders: string[];
	/** Re-send previously synced notes automatically after they are modified. */
	autoSyncSynced: boolean;
	/** Debounce (seconds) for auto sync. */
	autoSyncDelay: number;
	/** Convert [[wikilinks]] to plain text (true) or leave as-is (false). */
	stripWikilinks: boolean;
}

export const DEFAULT_SETTINGS: IdeashellSettings = {
	region: 'cn',
	customEndpoint: '',
	accessKey: '',
	sourceTag: 'obsidian',
	mapFolders: true,
	syncFolders: [],
	autoSyncSynced: false,
	autoSyncDelay: 10,
	stripWikilinks: true,
};

export function resolveEndpoint(s: IdeashellSettings): string {
	if (s.region === 'custom') return s.customEndpoint.trim().replace(/\/+$/, '');
	return REGION_ENDPOINTS[s.region];
}

export class IdeashellSettingTab extends PluginSettingTab {
	constructor(app: App, private plugin: IdeashellPlugin) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		const s = this.plugin.settings;

		new Setting(containerEl).setName('Connection').setHeading();

		new Setting(containerEl)
			.setName('Region')
			.setDesc('Choose the ideashell server that hosts your account.')
			.addDropdown((d) =>
				d
					.addOptions({ cn: 'China (ideashell.cn)', global: 'Global (ideashell.com)', custom: 'Custom endpoint' })
					.setValue(s.region)
					.onChange(async (v) => {
						s.region = v as Region;
						await this.plugin.saveSettings();
						this.display();
					}),
			);

		if (s.region === 'custom') {
			new Setting(containerEl)
				.setName('Custom endpoint')
				.setDesc('Full URL of your ideashell endpoint.')
				.addText((t) =>
					t.setPlaceholder('Endpoint URL').setValue(s.customEndpoint).onChange(async (v) => {
						s.customEndpoint = v;
						await this.plugin.saveSettings();
					}),
				);
		}

		new Setting(containerEl)
			.setName('API key')
			.setDesc('Your ideashell API key. Copy it from the ideashell app settings; it is the same key used for other AI clients.')
			.addText((t) => {
				t.inputEl.type = 'password';
				t.inputEl.addClass('ideashell-wide-input');
				t.setPlaceholder('32-character key').setValue(s.accessKey).onChange(async (v) => {
					s.accessKey = v.trim();
					this.plugin.resetClient();
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName('Test connection')
			.setDesc('Verify the endpoint and API key.')
			.addButton((b) =>
				b.setButtonText('Test').onClick(async () => {
					b.setDisabled(true);
					try {
						await this.plugin.api.listFolders();
						new Notice('Connected to ideashell');
					} catch (e) {
						new Notice(`Connection failed: ${errorMessage(e)}`, 8000);
					} finally {
						b.setDisabled(false);
					}
				}),
			);

		new Setting(containerEl).setName('Sync').setHeading();

		new Setting(containerEl)
			.setName('Source tag')
			.setDesc('Tag added to every note sent from Obsidian. Leave empty to disable.')
			.addText((t) =>
				t.setValue(s.sourceTag).onChange(async (v) => {
					s.sourceTag = v.trim().replace(/^#/, '');
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName('Map folders')
			.setDesc(
				'Put each note into an ideashell folder named after its Obsidian folder path. Notes in the vault root stay unfiled.',
			)
			.addToggle((t) =>
				t.setValue(s.mapFolders).onChange(async (v) => {
					s.mapFolders = v;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName('Folders to sync')
			.setDesc(
				'One vault folder path per line. "Sync all" sends every note under these folders. Leave empty to only sync notes marked with `ideashell: true` in frontmatter.',
			)
			.addTextArea((t) => {
				t.inputEl.rows = 4;
				t.inputEl.addClass('ideashell-wide-input');
				t.setPlaceholder('One folder path per line').setValue(s.syncFolders.join('\n')).onChange(async (v) => {
					s.syncFolders = v
						.split('\n')
						.map((x) => x.trim().replace(/^\/+|\/+$/g, ''))
						.filter((x) => x.length > 0);
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName('Auto-sync synced notes')
			.setDesc(
				'After a note has been sent once, automatically re-send it when you modify it. New notes are never sent automatically.',
			)
			.addToggle((t) =>
				t.setValue(s.autoSyncSynced).onChange(async (v) => {
					s.autoSyncSynced = v;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName('Auto-sync delay (seconds)')
			.setDesc('Wait this long after the last edit before re-sending.')
			.addSlider((sl) =>
				sl
					.setLimits(3, 120, 1)
					.setValue(s.autoSyncDelay)
					.onChange(async (v) => {
						s.autoSyncDelay = v;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('Convert wikilinks to text')
			.setDesc('Replace wikilinks with their display text, since ideashell cannot resolve vault links.')
			.addToggle((t) =>
				t.setValue(s.stripWikilinks).onChange(async (v) => {
					s.stripWikilinks = v;
					await this.plugin.saveSettings();
				}),
			);
	}
}

export function errorMessage(e: unknown): string {
	return e instanceof Error ? e.message : String(e);
}
