const POLITICAL_KEYWORDS = [
  "习近平", "拜登", "特朗普", "普京", "金正恩", "国家领导人", "最高领导人",
  "六四", "天安门", "颜色革命", "选举舞弊", "政权更迭", "颠覆政权",
  "制裁", "台独", "藏独", "港独", "新疆问题", "法轮功", "法輪功",
  "共产党", "共產黨", "民主运动", "民主運動",
  "tiananmen", "xi jinping", "biden", "trump", "putin",
  "color revolution", "regime change", "election fraud",
];

const CONTRACT_ADDRESS_RE = /\b0x[0-9a-fA-F]{40,42}\b/;

const HTML_SCRIPT_RE = /<[a-zA-Z\/!?][^>]{0,200}>|javascript\s*:|<script|<\/script|on\w+\s*=|eval\s*\(|document\.|window\./i;

export type FilterReason = "sensitive" | "contract" | "script";

export function checkContent(text: string): FilterReason | null {
  if (HTML_SCRIPT_RE.test(text)) return "script";
  if (CONTRACT_ADDRESS_RE.test(text)) return "contract";
  const lower = text.toLowerCase();
  for (const kw of POLITICAL_KEYWORDS) {
    if (lower.includes(kw.toLowerCase())) return "sensitive";
  }
  return null;
}

export function filterErrorMessage(reason: FilterReason): string {
  if (reason === "script") return "仅限正常文字、数字、符号（禁止代码或脚本）";
  return "包含敏感内容，请重新编辑再提交";
}
