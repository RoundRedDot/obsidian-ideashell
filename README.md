# ideashell for Obsidian

Send notes from [Obsidian](https://obsidian.md) to [ideashell (闪念贝壳)](https://ideashell.site).
One command sends the current note; edit it later and send again to update the same note in ideashell.

将 Obsidian 笔记一键同步到闪念贝壳。第一次同步新建笔记，之后再同步会原地更新，不会重复。

## What it does

- **Sync current note** — command palette, ribbon icon, or right-click a file. Creates a note in ideashell the first time; later runs update that same note.
- **Send selection as a new note** — select text, right-click → "Send selection to ideashell". Good for quick memos.
- **Sync all** — sends every note marked with `ideashell: true` in its frontmatter, plus everything under the folders you list in settings.
- **Folder mapping** (on by default) — a note in `Reading/2026/` lands in an ideashell folder named `Reading/2026`. ideashell folders are flat, so the Obsidian path becomes the folder name.
- **Tags** — frontmatter `tags` and inline `#tags` become ideashell tags. An `obsidian` tag is added so you can filter these notes in the app (configurable).
- **Optional auto re-sync** — off by default. When on, a note that was synced before is re-sent a few seconds after you stop editing. New notes are never sent without you asking.

Sync is **one-way**: Obsidian → ideashell. Changes made in the ideashell app do not flow back.

## Setup

1. Install the plugin (Community plugins → search "ideashell", or via [BRAT](https://github.com/TfTHacker/obsidian42-brat) with this repository).
2. In ideashell (web or app) open **Settings → MCP / connections** and copy your **access key**.
3. In Obsidian → Settings → ideashell: pick your region (China / Global), paste the key, click **Test**.

## How sync state is stored

After a successful sync the plugin writes a few keys into the note's frontmatter:

```yaml
ideashell_id: "1234567890"      # ideashell note id — used to update instead of re-create
ideashell_hash: "3f2a9c1b"      # content hash — unchanged notes are skipped
ideashell_synced: 2026-08-30T08:12:00.000Z
ideashell_url: https://…        # link to the note in ideashell, when available
```

Remove `ideashell_id` if you want the next sync to create a fresh note.

## What is sent, and where

This plugin makes network requests **only** to the ideashell MCP endpoint you select in settings
(`https://api.ideashell.cn/ideashell/mcp` for China, `https://api.ideashell.com/ideashell/mcp` for Global, or a custom URL).
It sends the note title, body, tags and folder name of the notes **you choose to sync**, authenticated with your access key.
Nothing else in your vault is read or transmitted; there is no telemetry.

An ideashell account is required. The access key grants the same permissions as your other MCP clients (Claude, Cursor, …); reset it in ideashell if it leaks.

## Limitations

- Text only. Images and attachments embedded in a note are not uploaded; `![[image.png]]` becomes `(image.png)`.
- Titles longer than 30 characters are truncated (ideashell limit); the full title is still in the file name on the Obsidian side.
- `[[wikilinks]]` are converted to plain text (configurable), since ideashell cannot resolve vault links.
- Deleting a note in Obsidian does not delete it in ideashell.
- Batch sync is sequential and paced to stay under ideashell's rate limit; very large first syncs take a while.

## Development

```bash
npm install
npm run dev     # watch build → main.js
npm run build   # type-check + production build
```

Copy `main.js`, `manifest.json`, `styles.css` into `<vault>/.obsidian/plugins/ideashell/` and reload Obsidian.

## License

MIT
