import OpenAI from "openai";

const openai = new OpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY ?? "dummy",
});

const WEB3_EXTRACTION_PROMPT = `You are a precise Web3 event extraction expert for web3release.com. VERSION: v2.1_strict_keywords

The platform has the following fixed sections. You MUST choose 1–2 strictly from this list:

- 测试网: Project launches/upgrades a testnet — alpha/beta test, devnet, early access, testnet reward programs.
- IDO/Launchpad: Token IDO, launchpad listing, token/NFT presale, mainnet launch, exchange listing, TGE.
- 融资公告: ONLY confirmed VC funding — must state a dollar amount raised AND investor names OR round type (seed, Series A/B).
- VC: VC investment / venture capital that does NOT meet strict 融资公告 rule. VC trend analysis, fund launches, investor watchlists.
- 链上奖励/空投: Use "空投" for airdrop campaigns. Use "链上任务" for on-chain quest campaigns (Galxe, Layer3, Zealy) with clear on-chain actions and rewards.
- 招聘: Web3/crypto/DeFi job postings at crypto-native organizations only.
- 节点招募: Validator/miner node recruitment programs.
- 开发者漏洞奖金: Bug bounties (Immunefi, Code4rena, HackenProof, Sherlock), hackathons (ETHGlobal), security audits, SDK/API releases.
- 项目捐赠/赞助: Grant programs (Gitcoin, Ethereum/Solana/Arbitrum/Optimism Foundation), ecosystem funds, accelerators, incubators.
- 政策监管: Government and regulatory announcements — SEC, CFTC, EU MiCA, central bank policy, crypto tax laws, exchange licensing.
- 快讯: Any clearly Web3/crypto content that does NOT match a section above — general news, market updates, protocol updates, partnerships, ecosystem news. CATCH-ALL.

STRICT KEYWORD MATCHING RULE (MANDATORY):
Before assigning any section except 快讯, you MUST verify that at least one required keyword appears in the article title or description text.
If the required keyword is NOT present → assign 快讯 instead. Do NOT force an article into a section just because the topic seems related.

Required keywords per section:
- 测试网       → must contain: "testnet" OR "测试网" OR "devnet" OR "alpha test" OR "beta test" OR "early access"
- IDO/Launchpad → must contain: "IDO" OR "Launchpad" OR "presale" OR "pre-sale" OR "TGE" OR "mainnet launch" OR "exchange listing" OR "token sale" OR "whitelist"
- 融资公告     → must contain: "raised" OR "funding" OR "融资" OR "investment round" OR "seed round" OR "Series A" OR "Series B"
- VC           → must contain: "VC" OR "venture capital" OR "风投" OR "investor" OR "fund" OR "portfolio"
- 链上奖励/空投 → must contain: "airdrop" OR "空投" OR "quest" OR "Galxe" OR "Layer3" OR "Zealy" OR "Intract" OR "points program" OR "XP" OR "claim"
- 招聘         → must contain: "hiring" OR "job" OR "position" OR "career" OR "recruit" OR "招聘" OR "join our team"
- 节点招募     → must contain: "node" OR "validator" OR "节点" OR "miner" OR "operator"
- 开发者漏洞奖金 → must contain: "bug bounty" OR "hackathon" OR "漏洞" OR "audit" OR "Immunefi" OR "ETHGlobal" OR "Code4rena" OR "bounty" OR "HackenProof"
- 项目捐赠/赞助 → must contain: "grant" OR "donate" OR "赞助" OR "捐赠" OR "Gitcoin" OR "ecosystem fund" OR "accelerator" OR "incubator"
- 政策监管     → must contain: "regulation" OR "regulatory" OR "政策" OR "监管" OR "SEC" OR "CFTC" OR "MiCA" OR "law" OR "bill" OR "legislation" OR "compliance" OR "license"
- 快讯         → no keyword check required (catch-all)

Routing priority (apply in order; keyword check required for steps 1–10):
1. Contains testnet keyword → 测试网
2. Contains IDO/presale/TGE/listing keyword → IDO/Launchpad
3. Contains funding keyword + dollar amount + investor → 融资公告
4. Contains VC/venture/fund keyword (without strict amount) → VC
5. Contains airdrop/quest keyword → 空投 or 链上任务
6. Contains node/validator keyword → 节点招募
7. Contains hiring/job keyword → 招聘
8. Contains bug bounty/hackathon keyword → 开发者漏洞奖金
9. Contains grant/donate keyword → 项目捐赠/赞助
10. Contains regulation/SEC/CFTC/监管 keyword → 政策监管
11. Any other clearly Web3/crypto content → 快讯 (no keyword check)
12. Not Web3/crypto → SKIP (return nothing)

Task: Extract valid, upcoming or ongoing Web3 events from the content below. Ignore events that ended more than 7 days ago.

Output rules:
- Return ONLY a raw JSON array [] — no explanations, no markdown, no code blocks
- Return [] if nothing qualifies

Format for each qualifying event:
{
  "title": "Concise, action-oriented title, max 12 words — keep the original source language",
  "project_name": "Official project name",
  "description": "80–150 word description — clearly explain the opportunity, who it is for, key dates, and what action to take. Keep the original source language.",
  "category": ["测试网"] or ["空投", "测试网"],
  "start_time": "2026-04-15T00:00:00Z or null",
  "end_time": "2026-04-20T23:59:59Z or null",
  "source_url": "original URL",
  "importance": "high or medium or low",
  "ai_confidence": 0.92,
  "tags": ["Solana", "Layer2", "DeFi"]
}

Strict rules:
1. category must be strictly chosen from the sections above — never invent new ones.
2. Skip stale events (ended >7 days ago, or announced >14 days ago with no future date).
3. Keep all text in the original source language — do NOT translate.
4. Times must be ISO 8601 (UTC). Use null if unknown.
5. Backend automatically sets expires_at to scrape time + 60 days.

Now process the following web page content:
{{PAGE_CONTENT}}`;

export const CATEGORY_MAP: Record<string, string> = {
  "测试网": "testnet",
  "IDO/Launchpad": "ido",
  "IDO": "ido",
  "Launchpad": "ido",
  "预售": "ido",
  "主网上线": "ido",
  "交易所上线": "ido",
  "融资公告": "funding",
  "空投": "quest",
  "Airdrop": "quest",
  "airdrop": "quest",
  "招聘": "recruiting",
  "节点招募": "nodes",
  "代币解锁": "unlock",
  "链上任务": "quest",
  "开发者专区": "devbounty",
  "开发者漏洞奖金": "devbounty",
  "项目捐赠/赞助": "grant",
  "捐赠/赞助": "grant",
  "捐赠赞助": "grant",
  "Grant": "grant",
  "Grants": "grant",
  "Sponsorship": "grant",
  "漏洞赏金": "devbounty",
  "Bug Bounty": "devbounty",
  "BugBounty": "devbounty",
  "Hackathon": "devbounty",
  "hackathon": "devbounty",
  "Meme热点": "meme",
  "Meme": "meme",
  "meme": "meme",
  "政策监管": "policy",
  "监管": "policy",
  "Regulation": "policy",
  "Policy": "policy",
  "行业动态": "industry",
  "Industry": "industry",
  "industry": "industry",
  "Industry News": "industry",
};

export interface ExtractedEvent {
  title: string;
  project_name: string;
  description: string;
  category: string[];
  start_time: string | null;
  end_time: string | null;
  source_url: string;
  importance: "high" | "medium" | "low";
  ai_confidence: number;
  tags: string[];
  section: string;
}

function mapCategory(categories: string[]): string {
  for (const cat of categories) {
    const key = CATEGORY_MAP[cat];
    if (key) return key;
    for (const [zh, en] of Object.entries(CATEGORY_MAP)) {
      if (cat.includes(zh)) return en;
    }
  }
  return "testnet";
}

export async function fetchPageContent(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`Failed to fetch URL: ${response.status}`);
  const html = await response.text();

  let text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();

  if (text.length > 12000) text = text.slice(0, 12000);
  return text;
}

export async function extractEvents(url: string): Promise<ExtractedEvent[]> {
  const pageContent = await fetchPageContent(url);
  const prompt = WEB3_EXTRACTION_PROMPT.replace("{{PAGE_CONTENT}}", pageContent);

  const completion = await openai.chat.completions.create({
    model: "gpt-5-mini",
    max_completion_tokens: 8192,
    messages: [{ role: "user", content: prompt }],
  });

  const raw = completion.choices[0]?.message?.content ?? "[]";

  let parsed: any[];
  try {
    const cleaned = raw.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "");
    parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) parsed = [];
  } catch {
    parsed = [];
  }

  return parsed
    .filter((ev: any) => ev && typeof ev.title === "string" && ev.title.trim())
    .map((ev: any) => ({
      title: String(ev.title ?? "").trim(),
      project_name: String(ev.project_name ?? "").trim(),
      description: String(ev.description ?? "").trim(),
      category: Array.isArray(ev.category) ? ev.category : [ev.category ?? "测试网"],
      start_time: ev.start_time ?? null,
      end_time: ev.end_time ?? null,
      source_url: String(ev.source_url ?? url).trim(),
      importance: (["high", "medium", "low"].includes(ev.importance) ? ev.importance : "medium") as "high" | "medium" | "low",
      ai_confidence: typeof ev.ai_confidence === "number" ? Math.min(1, Math.max(0, ev.ai_confidence)) : 0.8,
      tags: Array.isArray(ev.tags) ? ev.tags.map(String) : [],
      section: mapCategory(Array.isArray(ev.category) ? ev.category : [ev.category ?? "测试网"]),
    }));
}
