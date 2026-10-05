import {
	Editor,
	MarkdownView,
	normalizePath,
	Notice,
	Plugin,
	TFile,
	type MarkdownFileInfo,
} from "obsidian";
import {
	DEFAULT_SETTINGS,
	DateStamperSettingTab,
	type DateStamperSettings,
	type InsertTarget,
} from "./settings";
import {
	formatDate,
	formatLiteralPrefix,
	migrateFormat,
	sanitizeFileName,
} from "./dateformat";
import {
	buildTitleText,
	findFirstHeadingLine,
	findHeadingLine,
	findTitleLine,
	splitHeading,
} from "./matchers";

export default class DateStamperPlugin extends Plugin {
	settings!: DateStamperSettings;

	async onload(): Promise<void> {
		await this.loadSettings();

		// 左侧功能区图标
		this.addRibbonIcon("calendar-clock", "插入日期（Date Stamper）", () => {
			this.insertFromRibbon();
		});

		this.registerCommands();

		this.addSettingTab(new DateStamperSettingTab(this.app, this));
	}

	private registerCommands(): void {
		// 1) 主命令：按设置里的位置插入
		this.addCommand({
			id: "insert-date",
			name: "插入日期（按设置中的位置）",
			editorCallback: (editor: Editor, _ctx: MarkdownView | MarkdownFileInfo) => {
				void this.runInsert(editor, this.settings.target);
			},
		});

		// 2) 指定位置命令，绕过设置直接使用
		const fixedTargets: { id: string; name: string; target: InsertTarget }[] = [
			{ id: "insert-date-at-cursor", name: "插入日期到光标处", target: "cursor" },
			{ id: "insert-date-to-file-start", name: "插入日期到笔记开头", target: "file-start" },
			{ id: "insert-date-to-file-end", name: "插入日期到笔记末尾", target: "file-end" },
			{
				id: "insert-date-into-title",
				name: "插入日期到笔记标题（H1）里",
				target: "title-line",
			},
			{
				id: "insert-date-after-heading",
				name: "插入日期到指定标题的下一行",
				target: "after-heading",
			},
			{
				id: "insert-date-after-first-heading",
				name: "插入日期到第一个标题的下一行",
				target: "after-first-heading",
			},
			{
				id: "insert-date-at-marker",
				name: "插入日期到笔记中的标记处",
				target: "replace-marker",
			},
		];

		fixedTargets.forEach(({ id, name, target }) => {
			this.addCommand({
				id,
				name,
				editorCallback: (editor: Editor) => {
					void this.runInsert(editor, target);
				},
			});
		});

		// 3) 只复制不写正文
		this.addCommand({
			id: "copy-formatted-date",
			name: "复制格式化日期到剪贴板",
			callback: () => {
				const text = this.buildDateText();
				void this.writeClipboard(text);
				if (this.settings.showNotice) new Notice(`已复制：${text}`, 4000);
			},
		});

		// 4) 用日期重命名当前文件
		this.addCommand({
			id: "rename-file-with-date",
			name: "用当前日期重命名当前文件",
			checkCallback: (checking: boolean) => {
				const file = this.app.workspace.getActiveFile();
				if (!file) return false;
				if (!checking) {
					const name = formatDate(this.settings.format, {
						weekMode: this.settings.weekMode,
					});
					void this.renameFileWithDate(file, name);
				}
				return true;
			},
		});
	}

	// ——————————————————————— 核心逻辑 ———————————————————————

	/** 生成要插入的最终文本：先算日期，再套内容模板 */
	buildDateText(): string {
		const dateText = formatDate(this.settings.format, {
			weekMode: this.settings.weekMode,
		});

		const template = this.settings.insertTemplate ?? "{{date}}";
		const hasDateSlot = /\{\{\s*date\s*\}\}/i.test(template);

		if (!hasDateSlot) {
			// 用户模板里忘了写 {{date}}，兜底把日期拼在后面，避免"什么都不插入"
			return template + dateText;
		}
		return template.replace(/\{\{\s*date\s*\}\}/gi, dateText);
	}

	/** 唯一入口：把日期按 target 写进笔记 */
	private async runInsert(editor: Editor, target: InsertTarget): Promise<void> {
		// 重命名模式不走正文，单独处理
		if (target === "filename") {
			const file = this.app.workspace.getActiveFile();
			if (!file) {
				new Notice("没有打开的文件，无法重命名");
				return;
			}
			const name = formatDate(this.settings.format, {
				weekMode: this.settings.weekMode,
			});
			await this.renameFileWithDate(file, name);
			return;
		}

		const text = this.buildDateText();
		const isEmpty = editor.getValue().trim().length === 0;

		switch (target) {
			case "cursor":
				// 有选中内容时直接替换，符合编辑器直觉
				editor.replaceSelection(text);
				break;

			case "file-start":
				editor.replaceRange(isEmpty ? text : text + "\n", { line: 0, ch: 0 });
				break;

			case "file-end": {
				const lastLine = editor.lastLine();
				const lastCh = editor.getLine(lastLine).length;
				editor.replaceRange(isEmpty ? text : "\n" + text, {
					line: lastLine,
					ch: lastCh,
				});
				break;
			}

			case "title-line": {
				const lines = this.getLines(editor);
				let index = findTitleLine(lines);
				// 没有 H1 就退用第一个任意级别的标题
				if (index === -1) index = findFirstHeadingLine(lines);

				if (index === -1) {
					// 连标题都没有：在笔记最开头新建一个 H1
					editor.replaceRange(`# ${text}` + (isEmpty ? "" : "\n\n"), {
						line: 0,
						ch: 0,
					});
					break;
				}

				const raw = editor.getLine(index);
				const { marks, text: titleText } = splitHeading(raw);
				const newTitle = buildTitleText(
					titleText,
					text,
					this.settings.titleMode,
					this.settings.titleSeparator,
					formatLiteralPrefix(this.settings.format),
				);
				editor.replaceRange(
					`${marks}${newTitle}`,
					{ line: index, ch: 0 },
					{ line: index, ch: raw.length },
				);
				break;
			}

			case "after-heading": {
				const line = findHeadingLine(
					this.getLines(editor),
					this.settings.heading,
					this.settings.headingMatch,
				);
				if (line !== -1) {
					this.insertAfterLine(editor, line, text);
					break;
				}
				// 找不到标题
				if (this.settings.createHeadingIfMissing && this.settings.heading.trim()) {
					const headingText = `## ${this.settings.heading.trim()}`;
					const lastLine = editor.lastLine();
					const lastCh = editor.getLine(lastLine).length;
					const block = (isEmpty ? "" : "\n\n") + headingText + "\n" + text;
					editor.replaceRange(block, { line: lastLine, ch: lastCh });
					if (this.settings.showNotice) {
						new Notice(`已新建标题「${headingText}」并插入日期`, 4000);
					}
					break;
				}
				new Notice(
					`未找到标题「${this.settings.heading}」，已改为插入到笔记开头`,
					5000,
				);
				editor.replaceRange(text + "\n", { line: 0, ch: 0 });
				break;
			}

			case "after-first-heading": {
				const line = findFirstHeadingLine(this.getLines(editor));
				if (line === -1) {
					new Notice("笔记里还没有任何标题，已改为插入到笔记开头", 5000);
					editor.replaceRange(text + "\n", { line: 0, ch: 0 });
					break;
				}
				this.insertAfterLine(editor, line, text);
				break;
			}

			case "replace-marker": {
				const marker = this.settings.marker ?? "";
				const content = editor.getValue();
				const index = marker.length > 0 ? content.indexOf(marker) : -1;

				if (index === -1) {
					new Notice(
						`未找到标记「${marker || "(空)"}」，已改为插入到笔记开头`,
						5000,
					);
					editor.replaceRange(text + "\n", { line: 0, ch: 0 });
					break;
				}

				const replacement = this.settings.markerKeep
					? text + "\n" + marker
					: text;
				editor.replaceRange(
					replacement,
					editor.offsetToPos(index),
					editor.offsetToPos(index + marker.length),
				);
				break;
			}
		}

		if (this.settings.copyToClipboard) await this.writeClipboard(text);
		if (this.settings.showNotice) new Notice(text, 4000);
	}

	/** 在指定行尾插入（另起一行） */
	private insertAfterLine(editor: Editor, line: number, text: string): void {
		const lineLength = editor.getLine(line).length;
		editor.replaceRange("\n" + text, { line, ch: lineLength });
	}

	/** 取出编辑器全部行文本，交给 matchers 纯函数做定位 */
	private getLines(editor: Editor): string[] {
		const count = editor.lineCount();
		const lines: string[] = [];
		for (let i = 0; i < count; i++) lines.push(editor.getLine(i));
		return lines;
	}

	/** 用给定名称重命名文件（保留目录与扩展名），带防覆盖保护 */
	private async renameFileWithDate(file: TFile, name: string): Promise<void> {
		const safe = sanitizeFileName(name);
		if (!safe) {
			new Notice("格式串生成了空文件名，已取消重命名");
			return;
		}

		const ext = file.extension || "md";
		const parentPath = file.parent?.path ?? "";
		const newPath = normalizePath(
			parentPath && parentPath !== "/" ? `${parentPath}/${safe}.${ext}` : `${safe}.${ext}`,
		);

		if (normalizePath(file.path) === newPath) {
			new Notice("文件名已经是这个日期，无需重命名");
			return;
		}

		if (this.app.vault.getAbstractFileByPath(newPath)) {
			new Notice(`目标文件名已存在：${safe}.${ext}，已取消重命名`, 5000);
			return;
		}

		await this.app.fileManager.renameFile(file, newPath);
		if (this.settings.showNotice) new Notice(`已重命名为：${safe}.${ext}`, 4000);
	}

	/** 左侧图标入口 */
	private insertFromRibbon(): void {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!view || !view.editor) {
			new Notice("请先打开一篇 Markdown 笔记");
			return;
		}
		void this.runInsert(view.editor, this.settings.target);
	}

	private async writeClipboard(text: string): Promise<void> {
		try {
			await navigator.clipboard.writeText(text);
		} catch {
			new Notice("复制到剪贴板失败");
		}
	}

	// ——————————————————————— 设置持久化 ———————————————————————

	async loadSettings(): Promise<void> {
		const saved = (await this.loadData()) as Partial<DateStamperSettings> | null;
		this.settings = Object.assign({}, DEFAULT_SETTINGS, saved);
		// 1.0.0 → 1.1.0 格式自动升级
		this.settings.format = migrateFormat(this.settings.format);
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}
}
