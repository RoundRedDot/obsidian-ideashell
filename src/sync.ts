import { App, Notice, TFile, arrayBufferToBase64 } from 'obsidian';
import { FolderResolver, IdeashellApi, IMAGES_MAX, IMAGE_MAX_BYTES, NoteImage } from './ideashell-api';
import {
	FM_HASH,
	FM_ID,
	FM_MARK,
	FM_SYNCED,
	FM_URL,
	IMAGE_EXTENSIONS,
	convertNote,
	convertSelection,
	folderNameForPath,
} from './convert';
import type { IdeashellSettings } from './settings';
import { errorMessage } from './settings';

export type SyncOutcome = 'created' | 'updated' | 'unchanged' | 'failed';

export class SyncService {
	private folders: FolderResolver;
	private inFlight = new Set<string>();

	constructor(
		private app: App,
		private api: IdeashellApi,
		private settings: () => IdeashellSettings,
	) {
		this.folders = new FolderResolver(api);
	}

	invalidateFolders(): void {
		this.folders.invalidate();
	}

	/** Send one note. Creates on first sync, updates afterwards, skips when content hash is unchanged (unless forced). */
	async syncFile(file: TFile, opts: { force?: boolean; silent?: boolean } = {}): Promise<SyncOutcome> {
		if (this.inFlight.has(file.path)) return 'unchanged';
		this.inFlight.add(file.path);
		try {
			return await this.doSync(file, opts);
		} finally {
			this.inFlight.delete(file.path);
		}
	}

	private async doSync(file: TFile, opts: { force?: boolean; silent?: boolean }): Promise<SyncOutcome> {
		const s = this.settings();
		const raw = await this.app.vault.read(file);
		const meta = this.app.metadataCache.getFileCache(file);
		const note = convertNote(file, raw, meta, { stripWikilinks: s.stripWikilinks, sourceTag: s.sourceTag });

		const existingId = meta?.frontmatter?.[FM_ID] as string | undefined;
		const existingHash = meta?.frontmatter?.[FM_HASH] as string | undefined;
		if (existingId && existingHash === note.hash && !opts.force) {
			if (!opts.silent) new Notice(`ideashell: "${file.basename}" is already up to date`);
			return 'unchanged';
		}

		try {
			const folderName = s.mapFolders ? folderNameForPath(file.parent?.path ?? '') : null;
			const folderId = folderName ? await this.folders.resolve(folderName) : undefined;

			let noteId = existingId;
			let url: string | undefined;
			if (noteId) {
				await this.api.updateNote(noteId, { title: note.title, content: note.content, tags: note.tags });
				// keep the ideashell folder in step with where the file lives now
				if (folderId) await this.api.moveNotes([noteId], folderId);
			} else {
				const { images, skipped } = await this.collectImages(file);
				const created = await this.api.createNote({
					title: note.title,
					content: note.content,
					tags: note.tags,
					folderId,
					images,
				});
				noteId = created.note_id;
				url = created.url;
				if (skipped.length > 0 && !opts.silent) {
					new Notice(`ideashell: ${skipped.length} image(s) not attached: ${skipped.join(', ')}`, 8000);
				}
			}

			await this.app.fileManager.processFrontMatter(file, (fm) => {
				fm[FM_ID] = noteId;
				fm[FM_HASH] = note.hash;
				fm[FM_SYNCED] = new Date().toISOString();
				if (url) fm[FM_URL] = url;
			});

			const outcome: SyncOutcome = existingId ? 'updated' : 'created';
			if (!opts.silent) new Notice(`ideashell: "${file.basename}" ${outcome}`);
			return outcome;
		} catch (e) {
			// folder cache may be stale (folder deleted in app) → refresh for next attempt
			this.folders.invalidate();
			if (!opts.silent) new Notice(`ideashell: failed to sync "${file.basename}": ${errorMessage(e)}`, 8000);
			console.error('[ideashell] sync failed', file.path, e);
			return 'failed';
		}
	}

	/**
	 * Local raster images embedded as `![[x.png]]`, read from the vault and base64-encoded.
	 * Only attached on first sync: note_update cannot change attachments yet.
	 */
	private async collectImages(file: TFile): Promise<{ images: NoteImage[]; skipped: string[] }> {
		const images: NoteImage[] = [];
		const skipped: string[] = [];
		const seen = new Set<string>();
		const embeds = this.app.metadataCache.getFileCache(file)?.embeds ?? [];
		for (const embed of embeds) {
			const target = this.app.metadataCache.getFirstLinkpathDest(embed.link.split('#')[0] ?? embed.link, file.path);
			if (!target || !IMAGE_EXTENSIONS.has(target.extension.toLowerCase()) || seen.has(target.path)) continue;
			seen.add(target.path);
			if (images.length >= IMAGES_MAX) {
				skipped.push(`${target.name} (max ${IMAGES_MAX})`);
				continue;
			}
			if (target.stat.size > IMAGE_MAX_BYTES) {
				skipped.push(`${target.name} (>10MB)`);
				continue;
			}
			const bytes = await this.app.vault.readBinary(target);
			images.push({ data: arrayBufferToBase64(bytes), name: target.name });
		}
		return { images, skipped };
	}

	/** Send selected text as a brand-new note (like a quick memo). Not tracked in frontmatter. */
	async syncSelection(selection: string, sourceFile: TFile | null): Promise<void> {
		const s = this.settings();
		const { title, content } = convertSelection(selection, { stripWikilinks: s.stripWikilinks, sourceTag: s.sourceTag });
		try {
			const folderName = s.mapFolders && sourceFile ? folderNameForPath(sourceFile.parent?.path ?? '') : null;
			const folderId = folderName ? await this.folders.resolve(folderName) : undefined;
			await this.api.createNote({ title, content, tags: s.sourceTag ? [s.sourceTag] : undefined, folderId });
			new Notice(`ideashell: selection sent as "${title}"`);
		} catch (e) {
			this.folders.invalidate();
			new Notice(`ideashell: failed to send selection: ${errorMessage(e)}`, 8000);
			console.error('[ideashell] selection sync failed', e);
		}
	}

	/** All markdown files that are either marked `ideashell: true` or live under a configured sync folder. */
	collectSyncTargets(): TFile[] {
		const s = this.settings();
		const folders = s.syncFolders;
		return this.app.vault.getMarkdownFiles().filter((f) => {
			const fm = this.app.metadataCache.getFileCache(f)?.frontmatter;
			if (fm?.[FM_MARK] === true || fm?.[FM_ID]) return true;
			return folders.some((dir) => f.path === dir || f.path.startsWith(dir + '/'));
		});
	}

	/** Sequential batch with a short pause; the endpoint is rate-limited per minute. */
	async syncMany(files: TFile[], onProgress?: (done: number, total: number) => void): Promise<Record<SyncOutcome, number>> {
		const counts: Record<SyncOutcome, number> = { created: 0, updated: 0, unchanged: 0, failed: 0 };
		let i = 0;
		for (const f of files) {
			const r = await this.syncFile(f, { silent: true });
			counts[r]++;
			onProgress?.(++i, files.length);
			if (r === 'created' || r === 'updated') await sleep(400);
		}
		return counts;
	}

	isSynced(file: TFile): boolean {
		return Boolean(this.app.metadataCache.getFileCache(file)?.frontmatter?.[FM_ID]);
	}
}

function sleep(ms: number): Promise<void> {
	return new Promise((r) => setTimeout(r, ms));
}
