/**
 * dateformat.ts —— 纯 JS Date 实现的日期格式化引擎
 *
 * 不依赖 moment.js / dayjs，避免不同 Obsidian 版本的类型或运行时差异。
 *
 * 设计要点：
 *  - 使用 {{TOKEN}} 占位符语法，与笔记正文里的普通大括号互不干扰；
 *  - 未识别的占位符原样保留，方便用户排错；
 *  - 周数支持 ISO 8601 与「简单周」两种口径。
 */

export type WeekMode = "iso" | "simple";

export const CN_WEEKDAYS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
export const CN_WEEKDAYS_FULL = [
	"星期一",
	"星期二",
	"星期三",
	"星期四",
	"星期五",
	"星期六",
	"星期日",
];
export const EN_WEEKDAYS_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const EN_WEEKDAYS_LONG = [
	"Monday",
	"Tuesday",
	"Wednesday",
	"Thursday",
	"Friday",
	"Saturday",
	"Sunday",
];

export interface FormatOptions {
	/** 周数口径，默认 iso */
	weekMode?: WeekMode;
	/** 指定时间（便于预览 / 单元测试），默认当前时间 */
	date?: Date;
}

const pad = (n: number, len = 2): string => String(Math.abs(n)).padStart(len, "0");

/**
 * ISO 8601 周数：周一为一周之始，包含当年第一个周四的那一周为第 1 周。
 * 例：2026-10-05 -> 41
 */
export function getIsoWeek(date: Date): number {
	// 用 UTC 构造避免本地时区把日期挤到前一天
	const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
	const dayNum = d.getUTCDay() === 0 ? 7 : d.getUTCDay(); // 周一=1 ... 周日=7
	// 移动到本周的周四
	d.setUTCDate(d.getUTCDate() + 4 - dayNum);
	const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
	return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

/**
 * 简单周：从 1 月 1 日起，每满 7 天算一周（1 月 1 日所在的那 7 天为第 1 周）。
 * 例：2026-10-05 -> 41（该口径下约为 41~42）
 */
export function getSimpleWeek(date: Date): number {
	const start = new Date(date.getFullYear(), 0, 1);
	const diffDays = Math.floor(
		(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) -
			Date.UTC(start.getFullYear(), start.getMonth(), start.getDate())) /
			86400000,
	);
	return Math.floor(diffDays / 7) + 1;
}

/** 当前日期 -> 占位符取值映射表 */
export function buildTokenMap(date: Date, weekMode: WeekMode = "iso"): Record<string, string> {
	const isoWeekday = date.getDay() === 0 ? 7 : date.getDay(); // 周一=1 ... 周日=7
	const week = weekMode === "iso" ? getIsoWeek(date) : getSimpleWeek(date);
	const year = date.getFullYear();
	const month = date.getMonth() + 1;
	const day = date.getDate();
	const hours = date.getHours();
	const minutes = date.getMinutes();
	const seconds = date.getSeconds();
	const hour12 = hours % 12 === 0 ? 12 : hours % 12;

	const tzMinutes = -date.getTimezoneOffset(); // 东八区 -> 480
	const tzSign = tzMinutes >= 0 ? "+" : "-";
	const tz = `${tzSign}${pad(Math.floor(Math.abs(tzMinutes) / 60))}:${pad(Math.abs(tzMinutes) % 60)}`;
	const quarter = Math.floor((month - 1) / 3) + 1;

	const map: Record<string, string> = {
		// —— 年 ——
		YYYY: String(year),
		YY: pad(year % 100),

		// —— 月 ——
		MM: pad(month),
		M: String(month),
		CN_MONTH: `${month}月`,

		// —— 日 ——
		DD: pad(day),
		D: String(day),
		CN_DAY: `${day}日`,

		// —— 周 ——
		WW: pad(week),
		W: String(week),
		周: CN_WEEKDAYS[isoWeekday - 1],
		CN_WD: CN_WEEKDAYS[isoWeekday - 1],
		CN_WD_FULL: CN_WEEKDAYS_FULL[isoWeekday - 1],
		WD: String(isoWeekday),
		EN_WD: EN_WEEKDAYS_SHORT[isoWeekday - 1],
		EN_WD_FULL: EN_WEEKDAYS_LONG[isoWeekday - 1],
		WEEK_CN: `第${week}周`,

		// —— 时间 ——
		HH: pad(hours),
		H: String(hours),
		hh: pad(hour12),
		mm: pad(minutes),
		m: String(minutes),
		ss: pad(seconds),
		s: String(seconds),
		A: hours < 12 ? "上午" : "下午",
		a: hours < 12 ? "AM" : "PM",
		// 中文时间写法：21点41 / 21点41分 / 21点41分30秒
		CN_TIME: `${hours}点${pad(minutes)}`,
		CN_TIME_FULL: `${hours}点${pad(minutes)}分`,
		CN_TIME_SEC: `${hours}点${pad(minutes)}分${pad(seconds)}秒`,
		TIME_CN: `${pad(hours)}:${pad(minutes)}`,

		// —— 季度 ——
		Q: String(quarter),

		// —— 组合 ——
		DATE: `${year}-${pad(month)}-${pad(day)}`,
		TIME: `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`,
		DATETIME: `${year}-${pad(month)}-${pad(day)} ${pad(hours)}:${pad(minutes)}:${pad(seconds)}`,
		ISO: `${year}-${pad(month)}-${pad(day)}T${pad(hours)}:${pad(minutes)}:${pad(seconds)}${tz}`,
		TZ: tz,
		TS: `${year}${pad(month)}${pad(day)}${pad(hours)}${pad(minutes)}${pad(seconds)}`,
		UNIX: String(Math.floor(date.getTime() / 1000)),
	};

	return map;
}

const TOKEN_RE = /\{\{\s*([A-Za-z0-9_\u4e00-\u9fa5]+)\s*\}\}/g;

/**
 * 把格式串里的 {{TOKEN}} 替换为真实日期值。
 * 未识别的占位符原样保留（例如 {{FOO}} 仍是 {{FOO}}）。
 */
export function formatDate(format: string, options: FormatOptions = {}): string {
	const date = options.date ?? new Date();
	const map = buildTokenMap(date, options.weekMode ?? "iso");
	return format.replace(TOKEN_RE, (whole, key: string) => {
		const k = key.trim();
		return Object.prototype.hasOwnProperty.call(map, k) ? map[k] : whole;
	});
}

/** 占位符速查表（用于设置面板渲染） */
export const TOKEN_DOCS: { token: string; desc: string }[] = [
	{ token: "YYYY", desc: "四位年份" },
	{ token: "YY", desc: "两位年份" },
	{ token: "MM", desc: "月份（两位，补零）" },
	{ token: "M", desc: "月份（不补零）" },
	{ token: "DD", desc: "日期（两位，补零）" },
	{ token: "D", desc: "日期（不补零）" },
	{ token: "WW", desc: "周数（两位，补零）" },
	{ token: "W", desc: "周数（不补零）" },
	{ token: "周", desc: "中文星期简写，如 周一" },
	{ token: "CN_WD", desc: "同「周」，中文星期简写" },
	{ token: "CN_WD_FULL", desc: "中文星期全称，如 星期一" },
	{ token: "WD", desc: "星期数字 1~7（周一 = 1）" },
	{ token: "EN_WD", desc: "英文星期简写，如 Mon" },
	{ token: "EN_WD_FULL", desc: "英文星期全称，如 Monday" },
	{ token: "WEEK_CN", desc: "中文周数，如 第41周" },
	{ token: "Q", desc: "季度 1~4" },
	{ token: "HH", desc: "小时（24 制，两位）" },
	{ token: "hh", desc: "小时（12 制，两位）" },
	{ token: "mm", desc: "分钟（两位）" },
	{ token: "ss", desc: "秒（两位）" },
	{ token: "A", desc: "上午 / 下午" },
	{ token: "CN_TIME", desc: "中文时间，如 21点41" },
	{ token: "CN_TIME_FULL", desc: "中文时间带分，如 21点41分" },
	{ token: "CN_TIME_SEC", desc: "中文时间带秒，如 21点41分30秒" },
	{ token: "TIME_CN", desc: "时分，如 21:41" },
	{ token: "DATE", desc: "等于 YYYY-MM-DD" },
	{ token: "TIME", desc: "等于 HH:mm:ss" },
	{ token: "DATETIME", desc: "等于 YYYY-MM-DD HH:mm:ss" },
	{ token: "ISO", desc: "ISO 8601 时间戳（含时区）" },
	{ token: "TS", desc: "紧凑时间戳 YYYYMMDDHHmmss" },
	{ token: "UNIX", desc: "Unix 秒级时间戳" },
];

/**
 * 文件名安全化：去掉 Windows / macOS / Linux 都不允许或容易出问题的字符。
 */
export function sanitizeFileName(name: string): string {
	return name
		.replace(/[\\/:*?"<>|]/g, "-")
		.replace(/[\r\n\t]+/g, " ")
		.replace(/\s+/g, " ")
		.trim()
		.replace(/^\.+/, "")
		.replace(/\.+$/, "")
		.slice(0, 180);
}

/**
 * 取格式串里第一个占位符之前的字面前缀。
 * 例："日记-{{YYYY}}-{{MM}}" → "日记-"；"{{DATE}}" → ""
 */
export function formatLiteralPrefix(format: string): string {
	const match = format.match(/\{\{\s*[A-Za-z0-9_\u4e00-\u9fa5]+\s*\}\}/);
	return match && match.index !== undefined ? format.slice(0, match.index) : format;
}

// ——————————————————— 预设格式与迁移 ———————————————————

/** 1.0.0 的默认格式 */
export const LEGACY_DEFAULT_FORMAT = "日记-{{YYYY}}-{{MM}}-{{DD}}-WK{{WW}}-{{CN_WD}}";

/** 当前默认格式（1.1.0 起带时间） */
export const DEFAULT_FORMAT =
	"日记-{{YYYY}}-{{MM}}-{{DD}}-{{CN_TIME}}-WK{{WW}}-{{CN_WD}}";

/**
 * 把沿用 1.0.0 旧默认格式的用户平滑升级到新默认格式。
 * 只动「原样保留旧默认值」和「未设置」两种情况，用户自定义过的格式一律不碰。
 */
export function migrateFormat(format: string | undefined): string {
	if (!format || format.trim() === LEGACY_DEFAULT_FORMAT) return DEFAULT_FORMAT;
	return format;
}
