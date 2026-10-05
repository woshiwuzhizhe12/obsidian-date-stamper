# Date Stamper for Obsidian

Insert the current date and time into your notes at a configurable position, using a fully customizable format.

Example output:

```
日记-2026-10-05-21点41-WK41-周一
```

> Built for daily-note and journal workflows: stamp the date into a heading, append it at the end of a note, or write it into the note title itself — all with a single command.

[中文说明](README.zh-CN.md)

## Features

- **26+ format placeholders** — year, month, day, ISO 8601 week number, Chinese weekday, Chinese time (`21点41`), 12/24-hour clock, Unix timestamp, and more.
- **8 insertion positions** — cursor / start of note / end of note / below a specific heading / below the first H1 / **the H1 title itself** / replace a marker / rename the file.
- **9 commands**, each bindable to its own hotkey.
- **Live preview** in settings — see the formatted result for the current date as you type.
- **Smart heading handling** — skips YAML frontmatter and fenced code blocks, so a `#` inside a code sample is never mistaken for a heading.
- **Idempotent title stamping** — running the command repeatedly replaces the existing date stamp instead of stacking new ones.
- **Automatic format migration** — upgrading never overwrites a format you customized yourself.

## Installation

### From source (manual)

1. Download or build `main.js`, `manifest.json`, and `styles.css`.
2. Put all three into `<your-vault>/.obsidian/plugins/date-stamper/`.
3. Restart Obsidian, then enable **Date Stamper** under Settings → Community plugins.

### With BRAT

This plugin is not in the community plugin list. You can install it with [BRAT](https://github.com/TfTHacker/obsidian42-brat) by adding this repository URL.

## Usage

Open the command palette (`Ctrl/Cmd + P`) and search for **Date Stamper**:

| Command | What it does |
| --- | --- |
| Insert date (configured position) | Uses the position selected in settings |
| Insert date at cursor | Replaces the selection if there is one |
| Insert date at note start / end | — |
| Insert date below a heading | Uses the heading name configured in settings |
| Insert date below the first H1 | — |
| Insert date into the note title (H1) | Rewrites the H1 line itself |
| Copy formatted date to clipboard | — |
| Rename file with date | Experimental; refuses to overwrite an existing file |

A ribbon icon also triggers the main command.

## Format placeholders

The default format is:

```
日记-{{YYYY}}-{{MM}}-{{DD}}-{{CN_TIME}}-WK{{WW}}-{{CN_WD}}
```

| Placeholder | Output | Description |
| --- | --- | --- |
| `{{YYYY}}` / `{{YY}}` | 2026 / 26 | Year |
| `{{MM}}` / `{{M}}` | 10 / 10 | Month, padded / unpadded |
| `{{DD}}` / `{{D}}` | 05 / 5 | Day, padded / unpadded |
| `{{WW}}` | 41 | ISO 8601 week number (a "simple week" mode is also available) |
| `{{CN_WD}}` | 周一 | Chinese weekday |
| `{{WD}}` | 1 | Numeric weekday (1 = Monday) |
| `{{CN_TIME}}` | 21点41 | Chinese hour + minute |
| `{{CN_TIME_FULL}}` | 21点41分 | Chinese hour + minute, with 分 |
| `{{CN_TIME_SEC}}` | 21点41分30秒 | Chinese hour + minute + second |
| `{{TIME_CN}}` | 21:41 | 24-hour clock |
| `{{HH}}` / `{{hh}}` | 21 / 09 | 24-hour / 12-hour |
| `{{mm}}` / `{{ss}}` | 41 / 30 | Minute / second |
| `{{A}}` / `{{a}}` | 上午 / PM | AM/PM |
| `{{DATE}}` | 2026-10-05 | ISO date shortcut |
| `{{TIMESTAMP}}` | 1780690860 | Unix timestamp (seconds) |

The settings panel lists every placeholder together with its current value.

## Insert template

The inserted text is not limited to the bare date. Configure an "insert template" where `{{date}}` is the date slot:

| Template | Result |
| --- | --- |
| `{{date}}` | the date string alone |
| `# {{date}}` | a level-1 heading |
| `> 记录于 {{date}}` | a blockquote |
| `\| {{date}} \| note \|` | a table row |

## Development

```bash
npm install
npm run dev     # watch mode
npm run build   # type-check + production bundle
```

The date engine, heading matchers, and de-duplication logic live in modules that do **not** import `obsidian`, so they can be tested outside the Obsidian runtime:

```bash
node --experimental-strip-types verify.mts
```

This runs 51 assertions covering ISO week boundaries across years, Chinese weekday/time formatting, heading detection (including frontmatter and code-fence skipping), title rewriting and de-duplication, format migration, and filename sanitization.

### Project layout

```
src/
├── main.ts        # plugin entry: commands, insertion logic, renaming
├── dateformat.ts  # date engine, placeholder docs, format migration
├── matchers.ts    # pure heading-matching functions
└── settings.ts    # settings type, defaults, settings tab UI
```

## Notes on the week number

`{{WW}}` uses the **ISO 8601** definition (week 1 is the week containing the first Thursday). A "simple week" mode (a week counts after 7 days from Jan 1) is available in settings if you prefer it.

## License

MIT — see [LICENSE](LICENSE).
