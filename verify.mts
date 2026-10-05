/**
 * 日期引擎 + 定位逻辑自检脚本
 * 运行： node --experimental-strip-types verify.mts
 */
import {
	buildTokenMap,
	formatDate,
	formatLiteralPrefix,
	getIsoWeek,
	getSimpleWeek,
	migrateFormat,
	sanitizeFileName,
} from "./src/dateformat.ts";
import {
	buildTitleText,
	findFirstHeadingLine,
	findHeadingLine,
	findTitleLine,
	splitHeading,
} from "./src/matchers.ts";

let failed = 0;
function check(label: string, actual: unknown, expected: unknown): void {
	const ok = String(actual) === String(expected);
	if (!ok) failed++;
	console.log(`${ok ? "PASS" : "FAIL"}  ${label}\n      实际=${actual}  期望=${expected}`);
}

const d = new Date(2026, 9, 5, 21, 41, 30); // 2026-10-05 21:41:30 本地时间（周一）
const DATETEXT = "日记-2026-10-05-21点41-WK41-周一";

console.log("=== 1. 用户示例场景：2026-10-05 21:41 ===");
check("ISO 周数", getIsoWeek(d), 41);
check("简单周(1/1起满7天=1周)", getSimpleWeek(d), 40);
check("星期(JS getDay)", d.getDay(), 1); // 1 = 周一
check(
	"★ 默认格式",
	formatDate("日记-{{YYYY}}-{{MM}}-{{DD}}-{{CN_TIME}}-WK{{WW}}-{{CN_WD}}", { date: d }),
	DATETEXT,
);
check("中文时间", formatDate("{{CN_TIME}}", { date: d }), "21点41");
check("中文时间带分", formatDate("{{CN_TIME_FULL}}", { date: d }), "21点41分");
check("中文时间带秒", formatDate("{{CN_TIME_SEC}}", { date: d }), "21点41分30秒");
check("时分冒号", formatDate("{{TIME_CN}}", { date: d }), "21:41");

console.log("\n=== 2. 其它占位符 ===");
check(
	"中文年月日 + 星期",
	formatDate("{{YYYY}}年{{M}}月{{D}}日 {{CN_WD_FULL}} {{TIME}}", { date: d }),
	"2026年10月5日 星期一 21:41:30",
);
check(
	"组合占位符",
	formatDate("{{DATE}} / {{ISO}} / {{TS}} / {{Q}} / {{WEEK_CN}}", { date: d }),
	"2026-10-05 / 2026-10-05T21:41:30+08:00 / 20261005214130 / 4 / 第41周",
);
check("中文占位符 {{周}} 与英文", formatDate("{{周}} {{EN_WD}} {{EN_WD_FULL}}", { date: d }), "周一 Mon Monday");
check("未知占位符原样保留", formatDate("A{{FOO}}B", { date: d }), "A{{FOO}}B");

console.log("\n=== 3. 边界：跨年 ISO 周 ===");
check("2025-12-29(周一) 属 2026 年第 1 周", getIsoWeek(new Date(2025, 11, 29)), 1);
check("2026-01-01(周四) 属第 1 周", getIsoWeek(new Date(2026, 0, 1)), 1);
check("2026-01-04(周日) 仍属第 1 周", getIsoWeek(new Date(2026, 0, 4)), 1);
check("2026-01-05(周一) 进入第 2 周", getIsoWeek(new Date(2026, 0, 5)), 2);
check("2027-01-01(周五) 属 2026 年第 53 周", getIsoWeek(new Date(2027, 0, 1)), 53);

console.log("\n=== 4. 一周七天的中文星期 ===");
const base = new Date(2026, 9, 5); // 周一
check(
	"周一~周日",
	[0, 1, 2, 3, 4, 5, 6]
		.map((i) => formatDate("{{CN_WD}}/{{WD}}", { date: new Date(base.getTime() + i * 86400000) }))
		.join(" "),
	"周一/1 周二/2 周三/3 周四/4 周五/5 周六/6 周日/7",
);

console.log("\n=== 5. 标题定位（跳过 frontmatter 与代码块） ===");
const doc = [
	"---", // 0
	"tags: [a]", // 1
	"---", // 2
	"", // 3
	"# 日记-2026-10-05", // 4  H1
	"", // 5
	"## 日期 ##", // 6  结尾带 #
	"", // 7
	"```js", // 8  代码块开始
	"# 这是代码里的假标题", // 9
	"```", // 10 代码块结束
	"", // 11
	"## 今日记录 A", // 12
	"## 今日记录 B", // 13
];
check("精确匹配「## 日期 ##」（忽略结尾 #）", findHeadingLine(doc, "日期", "exact"), 6);
check("精确匹配「今日记录」不命中（标题带后缀）", findHeadingLine(doc, "今日记录", "exact"), -1);
check("包含匹配「今日记录」", findHeadingLine(doc, "今日记录", "contains"), 12);
check("代码块里的假标题不参与匹配", findHeadingLine(doc, "这是代码里的假标题", "exact"), -1);
check("frontmatter 内容不参与匹配", findHeadingLine(doc, "tags", "contains"), -1);
check("第一个标题行号", findFirstHeadingLine(doc), 4);
check("无标题文档返回 -1", findFirstHeadingLine(["正文", "还是正文"]), -1);
check("空标题名不命中", findHeadingLine(doc, "   ", "exact"), -1);
check("标题名含正则特殊字符不炸", findHeadingLine(["## a.b(c)"], "a.b(c)", "exact"), 0);
check("正文里的 # 不算标题", findFirstHeadingLine(["正文 # 不是标题"]), -1);

console.log("\n=== 6. 笔记标题（H1）处理 ===");
check("H1 行号", findTitleLine(doc), 4);
check("只有 H2 时 findTitleLine 返回 -1", findTitleLine(["## 只有 H2"]), -1);
check("拆分「## 日期 ##」", ((s) => `${s.marks}|${s.text}`)(splitHeading("## 日期 ##")), "## |日期");
check("拆分「# 日记」", ((s) => `${s.marks}|${s.text}`)(splitHeading("# 日记")), "# |日记");

check("追加（普通标题）", buildTitleText("我的记录", DATETEXT, "append", "-"), `我的记录-${DATETEXT}`);
check("★ 去重：标题已是日期串前缀 → 不拼成「日记-日记-…」", buildTitleText("日记", DATETEXT, "append", "-"), DATETEXT);
check("整体替换", buildTitleText("我的记录", DATETEXT, "replace", "-"), DATETEXT);
check("空标题 → 直接用日期串", buildTitleText("   ", DATETEXT, "append", "-"), DATETEXT);
check("无连接符", buildTitleText("记录", "2026-10-05", "append", ""), "记录2026-10-05");
check("标题已等于日期串 → 不重复", buildTitleText(DATETEXT, DATETEXT, "append", "-"), DATETEXT);

console.log("\n=== 6·补、重复执行不累积（同日再跑一次） ===");
const PREFIX = formatLiteralPrefix("日记-{{YYYY}}-{{MM}}-{{DD}}-{{CN_TIME}}-WK{{WW}}-{{CN_WD}}");
const LATER = "日记-2026-10-05-22点11-WK41-周一"; // 22:11 再跑一次
check("格式串字面前缀", PREFIX, "日记-");
check("无前缀格式", formatLiteralPrefix("{{DATE}}"), "");
check(
	"★ 「# 日记」二次执行 → 换时间不累积",
	buildTitleText(DATETEXT, LATER, "append", "-", PREFIX),
	LATER,
);
check(
	"★ 「# 我的记录」二次执行 → 保留原标题，只换日期章",
	buildTitleText(`我的记录-${DATETEXT}`, LATER, "append", "-", PREFIX),
	`我的记录-${LATER}`,
);
check(
	"★ 三次执行仍只有一枚日期章",
	buildTitleText(`我的记录-${LATER}`, DATETEXT, "append", "-", PREFIX),
	`我的记录-${DATETEXT}`,
);
check(
	"原标题以「日记-」开头但不是日期章 → 不误伤",
	buildTitleText("日记-我的实验", DATETEXT, "append", "-", PREFIX),
	`日记-我的实验-${DATETEXT}`,
);

console.log("\n=== 7. 格式迁移（1.0.0 → 1.1.0） ===");
check(
	"旧默认格式自动升级为带时间",
	migrateFormat("日记-{{YYYY}}-{{MM}}-{{DD}}-WK{{WW}}-{{CN_WD}}").includes("{{CN_TIME}}"),
	true,
);
check("空值回落到新默认", migrateFormat(undefined).includes("{{CN_TIME}}"), true);
check("自定义格式不被改写", migrateFormat("我的-{{DATE}}"), "我的-{{DATE}}");

console.log("\n=== 8. 文件名安全化 ===");
check("非法字符替换（8 个各换成一个 -）", sanitizeFileName('日记/2026:10*05?<>|"'), "日记-2026-10-05-----");
check("首尾点清理", sanitizeFileName("..日记.."), "日记");
check("换行折叠", sanitizeFileName("日记\n2026"), "日记 2026");

console.log("\n=== 9. 占位符表完整性 ===");
const map = buildTokenMap(d, "iso");
check("无空值占位符", Object.values(map).filter((v) => v === undefined || v === "").length, 0);

console.log(`\n${failed === 0 ? "全部通过 ✅" : `有 ${failed} 项失败 ❌`}`);
process.exit(failed === 0 ? 0 : 1);
