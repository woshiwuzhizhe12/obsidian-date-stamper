/**
 * matchers.ts —— 纯字符串匹配逻辑（不依赖 obsidian，便于直接测试）
 *
 * 负责在笔记正文里定位「标题行」与「可搜索行」。
 */

export type HeadingMatch = "exact" | "contains";

export function escapeRegExp(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 构造标题匹配正则 */
export function buildHeadingRegex(heading: string, mode: HeadingMatch): RegExp {
	const escaped = escapeRegExp(heading);
	return mode === "contains"
		? // 标题里含这几个字即可
			new RegExp(`^#{1,6}\\s*.*${escaped}.*$`)
		: // 整行等于标题文字；允许结尾多写 #（如 "## 日期 ##"）
			new RegExp(`^#{1,6}\\s*${escaped}\\s*#*\\s*$`);
}

/** 任意 Markdown 标题（# 后要有内容） */
export const FIRST_HEADING_RE = /^#{1,6}\s*\S/;

/** 一级标题（H1） */
export const TITLE_LINE_RE = /^#\s+\S/;

export type TitleMode = "append" | "replace";

/**
 * 返回可参与匹配的行号。
 * 跳过 YAML 属性区（frontmatter）和围栏代码块，
 * 避免把代码示例里的 "# xxx" 当成真标题。
 */
export function scanSearchableLines(lines: string[]): number[] {
	const result: number[] = [];
	let start = 0;

	if (lines.length > 0 && (lines[0] ?? "").trim() === "---") {
		for (let i = 1; i < lines.length; i++) {
			const t = (lines[i] ?? "").trim();
			if (t === "---" || t === "...") {
				start = i + 1;
				break;
			}
		}
	}

	let inFence = false;
	let fenceChar = "";
	for (let i = start; i < lines.length; i++) {
		const line = lines[i] ?? "";
		const fence = line.match(/^\s*(`{3,}|~{3,})/);
		if (fence && fence[1]) {
			const ch = fence[1].charAt(0);
			if (!inFence) {
				inFence = true;
				fenceChar = ch;
			} else if (ch === fenceChar) {
				inFence = false;
			}
			continue;
		}
		if (!inFence) result.push(i);
	}
	return result;
}

/** 找到第一个匹配的标题行号；找不到返回 -1 */
export function findHeadingLine(
	lines: string[],
	heading: string,
	mode: HeadingMatch,
): number {
	const key = heading.trim();
	if (!key) return -1;
	const re = buildHeadingRegex(key, mode);
	for (const i of scanSearchableLines(lines)) {
		if (re.test(lines[i] ?? "")) return i;
	}
	return -1;
}

/** 找到文档里第一个 Markdown 标题行号；找不到返回 -1 */
export function findFirstHeadingLine(lines: string[]): number {
	for (const i of scanSearchableLines(lines)) {
		if (FIRST_HEADING_RE.test(lines[i] ?? "")) return i;
	}
	return -1;
}

/** 找到文档里第一个一级标题（H1）行号；找不到返回 -1 */
export function findTitleLine(lines: string[]): number {
	for (const i of scanSearchableLines(lines)) {
		if (TITLE_LINE_RE.test(lines[i] ?? "")) return i;
	}
	return -1;
}

/** 把标题行拆成「## 」和「标题文字」两段（标题文字会去掉结尾多余的 #） */
export function splitHeading(line: string): { marks: string; text: string } {
	const m = line.match(/^(#{1,6}\s*)([\s\S]*)$/);
	if (!m) return { marks: "", text: line.trim() };
	return {
		marks: m[1] ?? "",
		text: (m[2] ?? "").replace(/\s*#*\s*$/, "").trim(),
	};
}

/**
 * 计算新的标题文字。
 *
 * 两条去重规则，保证同一天反复执行不会把标题越拼越长：
 * 1. 标题文字正好是日期串的前缀（标题「日记」+ 日期串「日记-2026-…」）→ 直接用日期串整体替换；
 * 2. 标题里已经含有一枚旧日期章（以格式串的字面前缀开头、后面紧跟数字，如「日记-2026-…」）
 *    → 把这一枚换成新的日期串，保留它前面的原标题。
 */
export function buildTitleText(
	existing: string,
	dateText: string,
	mode: TitleMode,
	separator: string,
	literalPrefix = "",
): string {
	const title = existing.trim();
	if (!title) return dateText;
	if (mode === "replace") return dateText;
	if (title === dateText) return title;

	// 规则 2：识别已经盖过的章
	if (literalPrefix.length > 0) {
		const at = title.indexOf(literalPrefix);
		if (at >= 0) {
			const rest = title.slice(at + literalPrefix.length);
			if (/^\d/.test(rest)) {
				return title.slice(0, at) + dateText;
			}
		}
	}

	const sep = separator ?? "-";
	// 规则 1：标题文字就是日期串的前缀
	if (sep.length > 0) {
		if (dateText.startsWith(title + sep)) return dateText;
		return `${title}${sep}${dateText}`;
	}
	if (dateText.startsWith(title)) return dateText;
	return `${title}${dateText}`;
}

