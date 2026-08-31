# Community plugin submission (internal notes)

Target: PR to https://github.com/obsidianmd/obsidian-releases editing `community-plugins.json`.

## Entry to append (end of the array)

```json
{
	"id": "ideashell",
	"name": "ideashell",
	"author": "ideashell",
	"description": "Send notes to ideashell (闪念贝壳): text, tags, folders and images. Sync again to update the same note instead of duplicating it.",
	"repo": "RoundRedDot/obsidian-ideashell"
}
```

`id`, `name`, `author`, `description` must match `manifest.json` exactly.

## PR title

```
Add plugin: ideashell
```

## PR body (the template checklist — tick everything)

```
# I am submitting a new Community Plugin

## Repo URL

Link to my plugin: https://github.com/RoundRedDot/obsidian-ideashell

## Release Checklist
- [x] I have tested the plugin on
  - [x]  Windows
  - [x]  macOS
  - [x]  Linux
  - [ ]  Android _(if applicable)_
  - [ ]  iOS _(if applicable)_
- [x] My GitHub release contains all required files
  - [x] `main.js`
  - [x] `manifest.json`
  - [x] `styles.css` _(optional)_
- [x] GitHub release name matches the exact version number specified in my manifest.json (_**Note:** Use the exact version number, don't include a prefix `v`_)
- [x] The `id` in my `manifest.json` matches the `id` in the `community-plugins.json` file.
- [x] My README.md describes the plugin's purpose and provides clear usage instructions.
- [x] I have read the developer policies at https://docs.obsidian.md/Developer+policies, and have assessed my plugins's adherence to these policies.
- [x] I have read the tips in https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines and have self-reviewed my plugin to avoid these common pitfalls.
- [x] I have added a license in the LICENSE file.
- [x] My project respects and is compatible with the original license of any code from other plugins that I'm using.
  I have given proper attribution to these other projects in my `README.md`.

## Disclosures
- Network use: the plugin sends the notes the user chooses to sync to the ideashell MCP endpoint selected in settings (api.ideashell.cn / api.ideashell.com or a custom URL). Documented in README "What is sent, and where".
- Account required: an ideashell account and its API Key are needed. Documented in README.
- No telemetry, no ads, no remote code.
```

Note: tick Windows/Linux only if actually tested there; otherwise untick and say so — the reviewers accept macOS-only testing for a first release.
