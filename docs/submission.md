# Community plugin submission (internal notes)

Since May 2026 Obsidian no longer accepts pull requests to `obsidianmd/obsidian-releases`
(`pull_request_creation_policy: collaborators_only`). Plugins are submitted through the
developer dashboard on the Community site and reviewed automatically within minutes;
approved plugins appear in-app within ~24 hours.

Docs: https://docs.obsidian.md/Plugins/Releasing/Submit+your+plugin
Announcement: https://obsidian.md/blog/future-of-plugins/

## Steps

1. Make sure the latest GitHub Release (tag == `manifest.json` version, no `v` prefix)
   contains `main.js`, `manifest.json`, `styles.css`. The release workflow does this on tag push.
2. Go to https://community.obsidian.md and sign in with an **Obsidian account**
   (the account used for Obsidian Sync/Publish; create one if needed).
3. Link the GitHub account that owns or administers `RoundRedDot/obsidian-ideashell`
   (profile → connected accounts).
4. Developer dashboard → add plugin → pick the repository `RoundRedDot/obsidian-ideashell`.
   The dashboard reads `manifest.json` for id / name / author / description; nothing to type.
5. Fix anything the automated review flags, push a new release, re-run.

## Manifest values the dashboard will read

```json
{
	"id": "ideashell",
	"name": "ideashell",
	"author": "ideashell",
	"description": "Send notes to ideashell (闪念贝壳): text, tags, folders and images. Sync again to update the same note instead of duplicating it.",
	"repo": "RoundRedDot/obsidian-ideashell"
}
```

## Disclosures to declare (when the dashboard asks)

- Network: sends the notes the user chooses to sync to the ideashell MCP endpoint selected in
  settings (api.ideashell.cn / api.ideashell.com or a custom URL). Documented in README
  "What is sent, and where".
- Account required: an ideashell account and its API Key.
- No telemetry, no ads, no remote code.

## Leftover from the old PR route

A fork `rayzzz-rdd/obsidian-releases` with branch `add-ideashell` was created on 2026-08-31
before discovering PRs are closed. It is unused and can be deleted.
