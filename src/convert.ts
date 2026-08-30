import { CachedMetadata, TFile } from 'obsidian';
import { FOLDER_NAME_MAX, TAG_MAX, TITLE_MAX } from './ideashell-api';

export interface ConvertOptions {
	stripWikilinks: boolean;
	sourceTag: string;
}

export interface ConvertedNote {
	title: string;
	content: string;
	tags: string[];
	hash: string;
}

/** Frontmatter keys the plugin owns. */
export const FM_ID = 'ideashell_id';
export const FM_SYNCED = 'ideashell_synced';
export const FM_HASH = 'ideashell_hash';
export const FM_URL = 'ideashell_url';
export const FM_MARK = 'ideashell';
/** Vault paths of images already attached to the ideashell note. */
export const FM_IMAGES = 'ideashell_images';
/** ideashell folder name the note was last placed in (null/absent = unfiled). */
export const FM_FOLDER = 'ideashell_folder';

/** Turn a vault note into the fields ideashell's note_create / note_update accept. */
export function convertNote(file: TFile, raw: string, meta: CachedMetadata | null, opts: ConvertOptions): ConvertedNote {
	const body = stripFrontmatter(raw, meta);
	const fmTitle = meta?.frontmatter?.title;
	const title = truncate(String(fmTitle ?? file.basename).trim() || file.basename, TITLE_MAX);

	let content = body.trim();
	if (opts.stripWikilinks) content = convertWikilinks(content);
	if (!content) content = title; // note_create requires non-empty content

	const tags = collectTags(meta, opts.sourceTag);
	return { title, content, tags, hash: fnv1a(title + '\n' + content + '\n' + tags.join(',')) };
}

/** Convert a selection into a standalone note: first line (or first words) becomes the title. */
export function convertSelection(selection: string, opts: ConvertOptions): { title: string; content: string } {
	let content = selection.trim();
	if (opts.stripWikilinks) content = convertWikilinks(content);
	const firstLine = content.split('\n').find((l) => l.trim().length > 0) ?? '';
	const title = truncate(firstLine.replace(/^#+\s*/, '').replace(/[*_`>\-[\]]/g, '').trim() || 'Obsidian', TITLE_MAX);
	return { title, content };
}

export function stripFrontmatter(raw: string, meta: CachedMetadata | null): string {
	const pos = meta?.frontmatterPosition ?? meta?.sections?.find((s) => s.type === 'yaml')?.position;
	if (pos) return raw.slice(pos.end.offset);
	return raw.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
}

export const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp']);

/** `[[Note|alias]]` → `alias`, `[[Note#Heading]]` → `Note`, `![[file.png]]` → `(file.png)`. */
export function convertWikilinks(text: string): string {
	return text
		.replace(/!\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/g, (_m, target: string) => `(${basename(target.trim())})`)
		.replace(/\[\[([^\]|#]+)(?:#([^\]|]*))?(?:\|([^\]]*))?\]\]/g, (_m, target: string, _h, alias?: string) =>
			(alias ?? target).trim(),
		);
}

/** Frontmatter tags + inline #tags, normalised, deduped, source tag first. */
export function collectTags(meta: CachedMetadata | null, sourceTag: string): string[] {
	const out: string[] = [];
	const push = (t: unknown) => {
		if (typeof t !== 'string') return;
		const v = t.replace(/^#/, '').trim();
		if (!v || v.length > TAG_MAX) return;
		if (isPluginKey(v)) return;
		if (!out.some((x) => x.toLowerCase() === v.toLowerCase())) out.push(v);
	};
	if (sourceTag) push(sourceTag);
	const fm = meta?.frontmatter?.tags ?? meta?.frontmatter?.tag;
	if (Array.isArray(fm)) fm.forEach(push);
	else if (typeof fm === 'string') fm.split(/[,\s]+/).forEach(push);
	meta?.tags?.forEach((t) => push(t.tag));
	return out;
}

function isPluginKey(v: string): boolean {
	return v === FM_MARK || v.startsWith('ideashell_');
}

/** Vault folder path → ideashell folder name ("a/b/c" kept, truncated from the left if too long). */
export function folderNameForPath(folderPath: string): string | null {
	const p = folderPath.replace(/^\/+|\/+$/g, '');
	if (!p) return null;
	if (p.length <= FOLDER_NAME_MAX) return p;
	// keep the deepest segments that fit
	const segs = p.split('/');
	let name = segs[segs.length - 1] ?? p;
	for (let i = segs.length - 2; i >= 0; i--) {
		const candidate = `${segs[i]}/${name}`;
		if (candidate.length > FOLDER_NAME_MAX) break;
		name = candidate;
	}
	return truncate(name, FOLDER_NAME_MAX);
}

/** Last path segment of a vault path or link target. */
export function basename(path: string): string {
	const i = path.lastIndexOf('/');
	return i >= 0 ? path.slice(i + 1) : path;
}

export function truncate(s: string, max: number): string {
	const chars = Array.from(s);
	return chars.length <= max ? s : chars.slice(0, max - 1).join('') + '…';
}

/** Small, fast, deterministic content hash (FNV-1a 32-bit, hex). Not cryptographic. */
export function fnv1a(s: string): string {
	let h = 0x811c9dc5;
	for (let i = 0; i < s.length; i++) {
		h ^= s.charCodeAt(i);
		h = Math.imul(h, 0x01000193) >>> 0;
	}
	return h.toString(16).padStart(8, '0');
}
