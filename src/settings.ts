import { App, PluginSettingTab, Setting } from "obsidian";
import type DateStamperPlugin from "./main";
import {
	buildTokenMap,
	DEFAULT_FORMAT,
	formatDate,
	formatLiteralPrefix,
	TOKEN_DOCS,
	type WeekMode,
} from "./dateformat";
import { buildTitleText, type HeadingMatch, type TitleMode } from "./matchers";

export type { HeadingMatch, TitleMode };

export type InsertTarget =
	| "cursor"
	| "file-start"
	| "file-end"
	| "title-line"
	| "after-heading"
	| "after-first-heading"
	| "replace-marker"
	| "filename";

export interface DateStamperSettings {
	/** 日期格式串，使用 {{TOKEN}} 占位符 */
	format: string;
	/** 插入正文时的内容模板，{{date}} 会被替换为格式化后的日期 */
	insertTemplate: string;
	/** 默认插入位置 */
	target: InsertTarget;

	/** target = title-line 时：标题的处理方式 */
	titleMode: TitleMode;
	/** target = title-line 追加模式时的连接符 */
	titleSeparator: string;

	/** target = after-heading 时查找的标题文本（不含 # 号） */
	heading: string;
	/** 标题匹配方式 */
	headingMatch: HeadingMatch;
	/** 找不到目标标题时，自动在文末创建该标题再插入 */
	createHeadingIfMissing: boolean;

	/** target = replace-marker 时查找的标记文本 */
	marker: string;
	/** 保留标记：把日期插在标记前面，标记本身不删除 */
	markerKeep: boolean;

	/** 周数口径 */
	weekMode: WeekMode;
	/** 是否同时复制到剪贴板 */
	copyToClipboard: boolean;
	/** 插入后是否弹出提示 */
	showNotice: boolean;
}

export const DEFAULT_SETTINGS: DateStamperSettings = {
	format: DEFAULT_FORMAT,
	insertTemplate: "{{date}}",
	target: "cursor",

	titleMode: "append",
	titleSeparator: "-",

	heading: "日期",
	headingMatch: "exact",
	createHeadingIfMissing: false,

	marker: "{{日期}}",
	markerKeep: false,

	weekMode: "iso",
	copyToClipboard: false,
	showNotice: true,
};

const TARGET_LABELS: Record<InsertTarget, string> = {
	cursor: "光标处（替换选中内容）",
	"file-start": "当前笔记最开头",
	"file-end": "当前笔记最末尾",
	"title-line": "笔记标题（H1）本身",
	"after-heading": "指定标题的下一行",
	"after-first-heading": "第一个标题（H1）的下一行",
	"replace-marker": "替换笔记里的标记（模板首选）",
	filename: "重命名当前文件（实验性）",
};

export class DateStamperSettingTab extends PluginSettingTab {
	plugin: DateStamperPlugin;
	private previewEl: HTMLElement | null = null;
	private titlePreviewEl: HTMLElement | null = null;
	private tokenSampleEls: { token: string; el: HTMLElement }[] = [];

	constructor(app: App, plugin: DateStamperPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.addClass("date-stamper-settings");
		this.tokenSampleEls = [];

		containerEl.createEl("h2", { text: "Date Stamper · 日期标记" });
		containerEl.createEl("p", {
			cls: "date-stamper-hint",
			text: "识别当前日期与时间，按你设定的格式插入到笔记的指定位置。所有设置立即生效，无需重启。",
		});

		// —————————————— 实时预览 ——————————————
		const previewBox = containerEl.createDiv({ cls: "date-stamper-preview" });
		previewBox.createDiv({ cls: "date-stamper-preview-label", text: "实时预览（基于当前日期时间）" });
		this.previewEl = previewBox.createDiv({ cls: "date-stamper-preview-value" });

		// —————————————— 日期格式 ——————————————
		new Setting(containerEl)
			.setName("日期格式")
			.setDesc(
				`使用 {{占位符}} 拼接。默认：${DEFAULT_FORMAT}` +
					"　→　日记-2026-10-05-21点41-WK41-周一",
			)
			.addTextArea((ta) => {
				ta.setValue(this.plugin.settings.format).onChange(async (value) => {
					this.plugin.settings.format = value;
					await this.plugin.saveSettings();
					this.refresh();
				});
				ta.inputEl.rows = 2;
				ta.inputEl.addClass("date-stamper-input");
			});

		// —————————————— 插入位置 ——————————————
		new Setting(containerEl)
			.setName("插入位置")
			.setDesc("点击「插入日期」命令或左侧日历图标时，默认插入到哪里。")
			.addDropdown((dd) => {
				Object.entries(TARGET_LABELS).forEach(([value, label]) => {
					dd.addOption(value, label);
				});
				dd.setValue(this.plugin.settings.target).onChange(async (value) => {
					this.plugin.settings.target = value as InsertTarget;
					await this.plugin.saveSettings();
					this.display();
				});
			});

		// —————————————— 笔记标题（H1）相关 ——————————————
		containerEl.createEl("h3", { text: "笔记标题（H1）" });
		containerEl.createEl("p", {
			cls: "date-stamper-hint",
			text: "用于「笔记标题（H1）本身」这种插入位置。找不到 H1 时会退用第一个标题；" +
				"连标题都没有则在笔记最开头新建一个。",
		});

		new Setting(containerEl)
			.setName("标题处理方式")
			.setDesc(
				"追加：保留原标题文字，把日期接在后面（# 我的记录 → # 我的记录-日记-2026-…）。" +
					"替换：标题整行换成日期串。",
			)
			.addDropdown((dd) =>
				dd
					.addOption("append", "追加到原标题后面")
					.addOption("replace", "整体替换原标题")
					.setValue(this.plugin.settings.titleMode)
					.onChange(async (value) => {
						this.plugin.settings.titleMode = value as TitleMode;
						await this.plugin.saveSettings();
						this.updateTitlePreview();
					}),
			);

		new Setting(containerEl)
			.setName("标题连接符")
			.setDesc("追加模式下，原标题文字与日期之间的连接符。默认「-」。")
			.addText((text) =>
				text
					.setPlaceholder("-")
					.setValue(this.plugin.settings.titleSeparator)
					.onChange(async (value) => {
						this.plugin.settings.titleSeparator = value;
						await this.plugin.saveSettings();
						this.updateTitlePreview();
					}),
			);

		this.titlePreviewEl = containerEl
			.createDiv({ cls: "date-stamper-preview" })
			.createDiv({ cls: "date-stamper-preview-value" });

		// —————————————— 标题相关（仅 after-heading 需要） ——————————————
		containerEl.createEl("h3", { text: "标题定位" });
		containerEl.createEl("p", {
			cls: "date-stamper-hint",
			text: "用于「指定标题的下一行」和「替换笔记里的标记」两种模式。",
		});

		new Setting(containerEl)
			.setName("目标标题名")
			.setDesc("填标题文字即可，不用写 # 号。例如填「今日记录」可匹配 ## 今日记录。")
			.addText((text) =>
				text
					.setPlaceholder("日期")
					.setValue(this.plugin.settings.heading)
					.onChange(async (value) => {
						this.plugin.settings.heading = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("标题匹配方式")
			.setDesc(
				"精确：整行标题必须完全等于上面的文字（自动忽略结尾多余的 #）。" +
					"包含：标题里含这几个字就算命中，适合标题随时间变化的情况。",
			)
			.addDropdown((dd) =>
				dd
					.addOption("exact", "精确匹配")
					.addOption("contains", "包含即匹配")
					.setValue(this.plugin.settings.headingMatch)
					.onChange(async (value) => {
						this.plugin.settings.headingMatch = value as HeadingMatch;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("找不到标题时自动创建")
			.setDesc("在笔记末尾新建一个「## 目标标题名」，然后把日期写在它下面。关掉则退化为插入到笔记开头。")
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.createHeadingIfMissing).onChange(async (value) => {
					this.plugin.settings.createHeadingIfMissing = value;
					await this.plugin.saveSettings();
				}),
			);

		// —————————————— 标记替换 ——————————————
		new Setting(containerEl)
			.setName("标记文本")
			.setDesc(
				"「替换笔记里的标记」模式下用。在笔记模板里写下这个标记，插件会找到它并替换。" +
					"默认 {{日期}}，可改成任何不会误伤的字符串。",
			)
			.addText((text) =>
				text
					.setPlaceholder("{{日期}}")
					.setValue(this.plugin.settings.marker)
					.onChange(async (value) => {
						this.plugin.settings.marker = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("保留标记")
			.setDesc(
				"开启：把日期插在标记前面，标记本身不删除，下次运行还在同一处追加一条记录。" +
					"关闭：标记被日期替换掉（一次性填充）。",
			)
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.markerKeep).onChange(async (value) => {
					this.plugin.settings.markerKeep = value;
					await this.plugin.saveSettings();
				}),
			);

		// —————————————— 周数口径 ——————————————
		containerEl.createEl("h3", { text: "格式选项" });

		new Setting(containerEl)
			.setName("周数算法")
			.setDesc(
				"ISO 8601：周一为一周之始，含当年第一个周四的那周为第 1 周（国际标准）。" +
					"简单周：1 月 1 日起每满 7 天算一周。",
			)
			.addDropdown((dd) =>
				dd
					.addOption("iso", "ISO 8601（推荐）")
					.addOption("simple", "简单周（1 月 1 日起算）")
					.setValue(this.plugin.settings.weekMode)
					.onChange(async (value) => {
						this.plugin.settings.weekMode = value as WeekMode;
						await this.plugin.saveSettings();
						this.refresh();
					}),
			);

		new Setting(containerEl)
			.setName("插入内容模板")
			.setDesc(
				"{{date}} 会被替换为上面格式串的结果。例如填「# {{date}}」则插入一级标题，" +
					"填「> 记录于 {{date}}」则插入引用块。",
			)
			.addText((text) =>
				text
					.setPlaceholder("{{date}}")
					.setValue(this.plugin.settings.insertTemplate)
					.onChange(async (value) => {
						this.plugin.settings.insertTemplate = value;
						await this.plugin.saveSettings();
						this.refresh();
					}),
			);

		new Setting(containerEl)
			.setName("同时复制到剪贴板")
			.setDesc("插入的同时把结果写入系统剪贴板。")
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.copyToClipboard).onChange(async (value) => {
					this.plugin.settings.copyToClipboard = value;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName("插入后弹出提示")
			.setDesc("在右上角显示插入内容，方便确认格式是否符合预期。")
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.showNotice).onChange(async (value) => {
					this.plugin.settings.showNotice = value;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName("恢复默认设置")
			.setDesc("把以上所有设置重置为初始值。")
			.addButton((btn) =>
				btn
					.setButtonText("恢复默认")
					.setWarning()
					.onClick(async () => {
						this.plugin.settings = Object.assign({}, DEFAULT_SETTINGS);
						await this.plugin.saveSettings();
						this.display();
					}),
			);

		// —————————————— 占位符速查表 ——————————————
		containerEl.createEl("h3", { text: "可用占位符" });
		containerEl.createEl("p", {
			cls: "date-stamper-hint",
			text: "下表「当前取值」一列按当前日期时间实时计算，可直接复制到上面用。",
		});

		const table = containerEl.createEl("table", { cls: "date-stamper-table" });
		const thead = table.createEl("thead");
		const headRow = thead.createEl("tr");
		["占位符", "含义", "当前取值"].forEach((t) => headRow.createEl("th", { text: t }));
		const tbody = table.createEl("tbody");

		TOKEN_DOCS.forEach(({ token, desc }) => {
			const tr = tbody.createEl("tr");
			tr.createEl("td", { text: `{{${token}}}`, cls: "date-stamper-code" });
			tr.createEl("td", { text: desc });
			const sample = tr.createEl("td", { cls: "date-stamper-code" });
			this.tokenSampleEls.push({ token, el: sample });
		});

		this.refresh();
	}

	/** 刷新实时预览与占位符取值 */
	private refresh(): void {
		const { format, insertTemplate, weekMode } = this.plugin.settings;
		const dateText = formatDate(format, { weekMode });
		const finalText = (insertTemplate ?? "{{date}}").replace(
			/\{\{\s*date\s*\}\}/gi,
			dateText,
		);

		if (this.previewEl) {
			this.previewEl.setText(finalText.length > 0 ? finalText : "（空）");
		}

		const map = buildTokenMap(new Date(), weekMode);
		this.tokenSampleEls.forEach(({ token, el }) => {
			el.setText(map[token] ?? "—");
		});

		this.updateTitlePreview();
	}

	/** 刷新「笔记标题」区块的示例 */
	private updateTitlePreview(): void {
		if (!this.titlePreviewEl) return;
		const { format, weekMode, titleMode, titleSeparator } = this.plugin.settings;
		const dateText = formatDate(format, { weekMode });
		const prefix = formatLiteralPrefix(format);
		const sample = "日记";
		const result = buildTitleText(sample, dateText, titleMode, titleSeparator, prefix);
		this.titlePreviewEl.setText(`示例：  # ${sample}   →   # ${result}`);
	}
}
