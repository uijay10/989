import OpenAI from "openai";

const openai = new OpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY ?? "dummy",
});

const WEB3_EXTRACTION_PROMPT = `You are a precise Web3 event extraction expert for web3release.com.

The platform has exactly 13 fixed sections. You MUST choose 1–2 strictly from this list. Read each definition carefully:

- 测试网: Project launches/upgrades a testnet. ONLY testnet — not IDO, not quest.
- IDO/Launchpad: Token IDO, launchpad listing (Binance Launchpad, Bybit, Gate Startup, Polkastarter), token/NFT presale (private sale, public sale, whitelist, CoinList, Seedify, PinkSale), mainnet launch, or exchange listing. Use for any token launch or listing event.
- 融资公告: ONLY confirmed VC funding events — must explicitly state a dollar amount raised AND name of investors OR round type (seed, Series A/B, angel). STRICT EXCLUSIONS — never use for: regulatory news, government policy, laws, bills, court rulings, partnership announcements, protocol integrations, market expansions, testnet launches, presales, IDO, or any content without a confirmed investment round and amount.
- 链上奖励/空投: Combined section. Use "空投" for airdrop campaigns (free token distribution). Use "链上任务" for on-chain quest campaigns — STRICT: must have specific on-chain actions (Swap/Stake/Mint/Bridge/etc, NOT just social tasks) WITH a clearly stated specific reward. Vague rewards → SKIP.
- 招聘: ONLY Web3/blockchain/crypto project job postings. The hiring company MUST be in the crypto/blockchain/DeFi/NFT/Web3 industry. Valid roles: engineers, developers, Discord/Telegram moderators, community managers, ambassadors, marketing, growth, BD, analysts, designers, product managers, operations. STRICTLY REJECT any job at traditional companies (schools, hospitals, banks, retailers, government, etc.) or any posting where the company is not clearly a crypto/Web3 project.
- 节点招募: Validator/miner node recruitment programs.
- 代币解锁: Scheduled token unlock or vesting cliff. Must have specific date or amount.
- 开发者漏洞奖金: Hackathons (ETHGlobal, Devcon, etc.), white-hat bug bounties, vulnerability reward programs (Immunefi, Code4rena, HackenProof, Sherlock), developer conferences, EIP-2048, developer tools, SDKs, APIs, smart contract audits/releases, open-source releases, developer tutorials.
- 项目捐赠/赞助: Grant programs, ecosystem funds, accelerators, incubators (Gitcoin, Web3/Ethereum/Solana Foundation, Arbitrum Grants, Optimism RPGF, Binance Labs, a16z).
- 行业动态: Broad Web3/crypto industry news — ecosystem updates, partnerships, protocol integrations, product launches, market trends, adoption milestones, exchange updates, major on-chain events, and general crypto developments. Do NOT use for: confirmed VC funding (→ 融资公告), regulatory/gov news (→ 政策监管), token launches (→ IDO/Launchpad), meme tokens (→ Meme热点), or hackathons / bug bounties / developer tools (→ 开发者漏洞奖金).
- Meme热点: Trending meme tokens, meme coin launches, meme culture events, viral crypto memes (DOGE/SHIB/PEPE-style). NOT general market news.
- 政策监管: Government and regulatory announcements about crypto — SEC, CFTC, EU MiCA, central bank policy, crypto tax laws, exchange licensing, government crypto strategy.

Strict routing — apply in this priority order:
1. Testnet content → 测试网 (never 融资公告 or IDO/Launchpad)
2. Presale / whitelist sale / mainnet launch / exchange listing → IDO/Launchpad
3. SEC / CFTC / government regulatory / crypto law / policy announcement → 政策监管
4. Meme token launch / meme coin viral event → Meme热点
5. Explicitly states "raised $X" + named investor/round → 融资公告
6. Partnership / integration / protocol update → 开发者漏洞奖金 (NOT 融资公告 or IDO/Launchpad)
7. Airdrop / on-chain quest with clear reward → 链上奖励/空投 (output "空投" for airdrops, "链上任务" for quests)
8. Bug bounty / security reward / hackathon → 开发者漏洞奖金
9. Grant / ecosystem fund → 项目捐赠/赞助
10. Job posting → 招聘
11. Ecosystem update / partnership / product launch / market trend / general crypto news → 行业动态
12. Ambiguous / does not clearly fit any section → SKIP (return nothing)

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
1. category must be strictly chosen from the 15 sections above — never invent new ones.
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
