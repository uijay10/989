import OpenAI from "openai";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

export interface AiProvider {
  name: string;
  client: OpenAI;
  model: string;
  maxTokens: number;
  /** Temporary rate-limit cooldown (per-minute 429). Resets after RATE_LIMIT_COOLDOWN_MS. */
  rateLimitCooldownUntil: number;
  /** Daily API call counter */
  dailyCallCount: number;
  /** Hard daily request limit (0 = unlimited) */
  dailyCallLimit: number;
  /** Unix-ms timestamp of next UTC-midnight reset */
  dailyResetAt: number;
}

const RATE_LIMIT_COOLDOWN_MS = 10 * 60 * 1000; // 10 min per-minute rate-limit cooldown
const ERROR_COOLDOWN_MS      = 30 * 1000;        // 30 s for non-rate-limit errors

// ── Groq 6-hour slot limiting (平摊每日 1000 次额度) ────────────────────────
const GROQ_MAX_PER_6H = 250; // 每6小时最多 250 次 = 1000/day 平均分配
const GROQ_6H_MS = 6 * 60 * 60 * 1000;
const groqSlotCounts = new Map<number, number>(); // slotStart(ms) → callCount

function getGroqSlotStart(): number {
  return Math.floor(Date.now() / GROQ_6H_MS) * GROQ_6H_MS;
}

function isGroqSlotFull(): boolean {
  const count = groqSlotCounts.get(getGroqSlotStart()) ?? 0;
  return count >= GROQ_MAX_PER_6H;
}

function incrementGroqSlot(): void {
  const slot = getGroqSlotStart();
  groqSlotCounts.set(slot, (groqSlotCounts.get(slot) ?? 0) + 1);
  // 清理超过 24h 的旧窗口
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  for (const [k] of groqSlotCounts) { if (k < cutoff) groqSlotCounts.delete(k); }
}

// ==================== DeepSeek 每日成本控制 ====================
// 每日预算上限：$0.50/天（按自然日 UTC 0:00 重置）
// 快讯 DeepSeek（Groq窗口耗尽后）：~133次/天 × 10篇 × $0.0026/次 ≈ $0.35/天
// 其他9个板块（主 cron）：12次/天 × 50篇 × $0.013/次 ≈ $0.16/天
// 理论峰值 ≈ $0.51/天；实际因去重通常只有 $0.10–0.25/天
// 到达上限后当天停止调用，UTC 0:00 自动重置
// 花费持久化到数据库（ai_cost_daily 表），重启后不归零
const DEEPSEEK_TOTAL_BUDGET = 0.50;   // 每日总上限 $0.50
const DEEPSEEK_HOURLY_BUDGET = DEEPSEEK_TOTAL_BUDGET / 24; // 每小时均分预算（UTC 小时桶）

let deepseekTotalDailyCost = 0;
let deepseekCostResetAt = 0;
let deepseekBudgetInitialized = false;
let deepseekHourlyCost = 0;
let deepseekHourlyKey = "";

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

function currentUtcHourKey(): string {
  const d = new Date();
  const ymd = d.toISOString().slice(0, 10);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  return `${ymd}-${hh}`; // e.g. 2026-04-16-07
}

function nextUtcHour(): number {
  const now = new Date();
  const next = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    now.getUTCHours() + 1,
    0,
    0,
    0,
  );
  return next;
}

/** 启动时从数据库恢复当日累计花费，防止重启后归零 */
export async function initDeepSeekDailyBudget(): Promise<void> {
  try {
    // ── DeepSeek cost table ──────────────────────────────────────────────────
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS ai_cost_daily (
        date TEXT PRIMARY KEY,
        deepseek_cost_usd REAL NOT NULL DEFAULT 0
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS ai_cost_hourly (
        hour_key TEXT PRIMARY KEY,
        deepseek_cost_usd REAL NOT NULL DEFAULT 0
      )
    `);
    const today = todayUtc();
    const result = await db.execute(sql`
      SELECT deepseek_cost_usd FROM ai_cost_daily WHERE date = ${today}
    `);
    if (result.rows.length > 0) {
      deepseekTotalDailyCost = (result.rows[0] as { deepseek_cost_usd: number }).deepseek_cost_usd;
      console.log(`[DeepSeek Budget] 从数据库恢复今日累计: $${deepseekTotalDailyCost.toFixed(4)} / $${DEEPSEEK_TOTAL_BUDGET}`);
    } else {
      deepseekTotalDailyCost = 0;
      console.log(`[DeepSeek Budget] 今日(${today})首次启动，从 $0 开始`);
    }
    deepseekCostResetAt = nextMidnightUtc();

    // Restore current-hour spend (UTC hour bucket)
    deepseekHourlyKey = currentUtcHourKey();
    const hourResult = await db.execute(sql`
      SELECT deepseek_cost_usd FROM ai_cost_hourly WHERE hour_key = ${deepseekHourlyKey}
    `);
    if (hourResult.rows.length > 0) {
      deepseekHourlyCost = (hourResult.rows[0] as { deepseek_cost_usd: number }).deepseek_cost_usd;
      console.log(`[DeepSeek Budget] 从数据库恢复本小时(${deepseekHourlyKey} UTC)累计: $${deepseekHourlyCost.toFixed(4)} / $${DEEPSEEK_HOURLY_BUDGET.toFixed(4)}`);
    } else {
      deepseekHourlyCost = 0;
      console.log(`[DeepSeek Budget] 本小时(${deepseekHourlyKey} UTC)首次启动，从 $0 开始（小时预算 $${DEEPSEEK_HOURLY_BUDGET.toFixed(4)}）`);
    }

    // Best-effort cleanup: keep only ~3 days of hourly rows
    db.execute(sql`
      DELETE FROM ai_cost_hourly
      WHERE hour_key < ${new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)}
    `).catch(() => {/* non-fatal */});

    deepseekBudgetInitialized = true;

    // ── Provider daily-exhausted state table ─────────────────────────────────
    // Persists which free providers hit their daily quota, so restarts don't
    // reset the exhausted flag and waste one 429 call per exhausted key.
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS provider_daily_exhausted (
        date TEXT NOT NULL,
        provider_name TEXT NOT NULL,
        PRIMARY KEY (date, provider_name)
      )
    `);
    const exhaustedRows = await db.execute(sql`
      SELECT provider_name FROM provider_daily_exhausted WHERE date = ${today}
    `);
    const exhaustedNames = new Set(
      (exhaustedRows.rows as { provider_name: string }[]).map(r => r.provider_name)
    );
    if (exhaustedNames.size > 0) {
      for (const p of providers) {
        if (exhaustedNames.has(p.name) && p.dailyCallLimit > 0) {
          p.dailyCallCount = p.dailyCallLimit;
          console.log(`[ai-provider] Restored daily-exhausted state for ${p.name} from DB`);
        }
      }
    }
  } catch (e) {
    console.warn("[DeepSeek Budget] 无法从数据库加载今日成本，从 $0 开始:", e);
    deepseekBudgetInitialized = true;
  }
}

/** 将当日花费异步持久化到数据库 */
function persistDeepSeekCost(): void {
  const today = todayUtc();
  const cost = deepseekTotalDailyCost;
  db.execute(sql`
    INSERT INTO ai_cost_daily (date, deepseek_cost_usd)
    VALUES (${today}, ${cost})
    ON CONFLICT (date) DO UPDATE SET deepseek_cost_usd = ${cost}
  `).catch(() => {/* 非致命，忽略 */});
}

/** 将本小时花费异步持久化到数据库 */
function persistDeepSeekHourlyCost(): void {
  const key = deepseekHourlyKey || currentUtcHourKey();
  const cost = deepseekHourlyCost;
  db.execute(sql`
    INSERT INTO ai_cost_hourly (hour_key, deepseek_cost_usd)
    VALUES (${key}, ${cost})
    ON CONFLICT (hour_key) DO UPDATE SET deepseek_cost_usd = ${cost}
  `).catch(() => {/* 非致命，忽略 */});
}

/** 立即将内存计数和数据库行同时清零（管理接口调用） */
export async function resetDeepSeekBudgetNow(): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  deepseekTotalDailyCost = 0;
  deepseekCostResetAt = nextMidnightUtc();
  deepseekHourlyKey = currentUtcHourKey();
  deepseekHourlyCost = 0;
  await db.execute(sql`
    INSERT INTO ai_cost_daily (date, deepseek_cost_usd)
    VALUES (${today}, 0)
    ON CONFLICT (date) DO UPDATE SET deepseek_cost_usd = 0
  `).catch(() => {});
  await db.execute(sql`
    INSERT INTO ai_cost_hourly (hour_key, deepseek_cost_usd)
    VALUES (${deepseekHourlyKey}, 0)
    ON CONFLICT (hour_key) DO UPDATE SET deepseek_cost_usd = 0
  `).catch(() => {});
  console.log("[DeepSeek Budget] 管理员手动重置：内存 + DB 均已清零");
}

function checkDeepSeekBudget(_category: string): boolean {
  if (!deepseekBudgetInitialized) return true; // 初始化完成前不拦截
  if (deepseekCostResetAt === 0) deepseekCostResetAt = nextMidnightUtc();
  if (Date.now() >= deepseekCostResetAt) {
    // 把刚结束的那一天的 DB 行清零——下次重启时恢复到 $0，不会带着旧花费锁死
    const prevDate = new Date(deepseekCostResetAt - 1).toISOString().slice(0, 10);
    db.execute(sql`UPDATE ai_cost_daily SET deepseek_cost_usd = 0 WHERE date = ${prevDate}`).catch(() => {});
    deepseekTotalDailyCost = 0;
    deepseekCostResetAt = nextMidnightUtc();
    // New day → new hour bucket too
    deepseekHourlyKey = currentUtcHourKey();
    deepseekHourlyCost = 0;
    persistDeepSeekCost();
    persistDeepSeekHourlyCost();
    console.log("[DeepSeek Budget] 每日成本已重置（UTC 午夜）");
  }
  // Hour bucket reset (UTC hour)
  const nowKey = currentUtcHourKey();
  if (!deepseekHourlyKey) deepseekHourlyKey = nowKey;
  if (nowKey !== deepseekHourlyKey) {
    deepseekHourlyKey = nowKey;
    deepseekHourlyCost = 0;
    persistDeepSeekHourlyCost();
    console.log(`[DeepSeek Budget] 小时桶已切换到 ${deepseekHourlyKey}（UTC），本小时预算 $${DEEPSEEK_HOURLY_BUDGET.toFixed(4)}`);
  }
  if (deepseekHourlyCost >= DEEPSEEK_HOURLY_BUDGET) {
    console.warn(`[DeepSeek Budget] 本小时预算已达 $${DEEPSEEK_HOURLY_BUDGET.toFixed(4)}（已用 $${deepseekHourlyCost.toFixed(4)}），等待下一个 UTC 小时`);
    return false;
  }
  if (deepseekTotalDailyCost >= DEEPSEEK_TOTAL_BUDGET) {
    console.warn(`[DeepSeek Budget] 每日总预算已达 $${DEEPSEEK_TOTAL_BUDGET}（已用 $${deepseekTotalDailyCost.toFixed(4)}）`);
    return false;
  }
  return true;
}

function recordDeepSeekCost(_category: string, inputTokens: number, outputTokens: number): void {
  // DeepSeek-chat: 输入 $0.27/1M，输出 $1.10/1M
  const cost = (inputTokens * 0.27 + outputTokens * 1.10) / 1_000_000;
  // Ensure hour bucket is current before recording
  const nowKey = currentUtcHourKey();
  if (!deepseekHourlyKey) deepseekHourlyKey = nowKey;
  if (nowKey !== deepseekHourlyKey) {
    deepseekHourlyKey = nowKey;
    deepseekHourlyCost = 0;
  }
  deepseekTotalDailyCost += cost;
  deepseekHourlyCost += cost;
  console.log(
    `[DeepSeek Cost] 本次 $${cost.toFixed(5)} | ` +
    `本小时(${deepseekHourlyKey} UTC) $${deepseekHourlyCost.toFixed(4)} / $${DEEPSEEK_HOURLY_BUDGET.toFixed(4)} | ` +
    `今日 $${deepseekTotalDailyCost.toFixed(4)} / $${DEEPSEEK_TOTAL_BUDGET}`
  );
  persistDeepSeekCost();
  persistDeepSeekHourlyCost();
}

// Free-tier daily limits (requests per day)
const DAILY_LIMITS: Record<string, number> = {
  groq:       1000,  // Groq llama-3.3-70b free tier: 1,000 req/day
  groq1:      1000,
  groq2:      1000,
  groq3:      1000,
  groq4:      1000,
  groq5:      1000,
  groq6:      1000,
  groq7:      1000,
  groq8:      1000,
  groq9:      1000,
  groq10:     1000,
  groq11:     1000,
  cerebras:   1000,  // Cerebras free tier: ~1,000 req/day
  sambanova:  1000,  // SambaNova free tier: ~1,000 req/day
  openrouter: 200,   // OpenRouter :free models cap
  together:   300,   // Together AI free credits (conserve)
  fireworks:  300,   // Fireworks AI free credits (conserve)
  novita:     300,   // Novita AI free credits (conserve)
  deepseek:   0,     // 0 = unlimited (paid)
};

function nextMidnightUtc(): number {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
}

function makeProvider(
  name: string,
  baseURL: string,
  apiKey: string | undefined,
  model: string,
  maxTokens: number,
): AiProvider | null {
  if (!apiKey) return null;
  const limit = DAILY_LIMITS[name] ?? 0;
  return {
    name,
    client: new OpenAI({ baseURL, apiKey }),
    model,
    maxTokens,
    rateLimitCooldownUntil: 0,
    dailyCallCount: 0,
    dailyCallLimit: limit,
    dailyResetAt: nextMidnightUtc(),
  };
}

function buildProviderList(): AiProvider[] {
  const list: (AiProvider | null)[] = [
    // ── 优先：Groq 免费额度 ───────────────────────────────────────────────
    makeProvider(
      "groq",
      "https://api.groq.com/openai/v1",
      process.env.GROQ_API_KEY ?? process.env.GROQ,
      "llama-3.3-70b-versatile",
      4096,
    ),
    // ── Groq 备用 Key 轮换 (GROQ1–GROQ11) ──────────────────────────────
    makeProvider("groq1",  "https://api.groq.com/openai/v1", process.env.GROQ1,  "llama-3.3-70b-versatile", 4096),
    makeProvider("groq2",  "https://api.groq.com/openai/v1", process.env.GROQ2,  "llama-3.3-70b-versatile", 4096),
    makeProvider("groq3",  "https://api.groq.com/openai/v1", process.env.GROQ3,  "llama-3.3-70b-versatile", 4096),
    makeProvider("groq4",  "https://api.groq.com/openai/v1", process.env.GROQ4,  "llama-3.3-70b-versatile", 4096),
    makeProvider("groq5",  "https://api.groq.com/openai/v1", process.env.GROQ5,  "llama-3.3-70b-versatile", 4096),
    makeProvider("groq6",  "https://api.groq.com/openai/v1", process.env.GROQ6,  "llama-3.3-70b-versatile", 4096),
    makeProvider("groq7",  "https://api.groq.com/openai/v1", process.env.GROQ7,  "llama-3.3-70b-versatile", 4096),
    makeProvider("groq8",  "https://api.groq.com/openai/v1", process.env.GROQ8,  "llama-3.3-70b-versatile", 4096),
    makeProvider("groq9",  "https://api.groq.com/openai/v1", process.env.GROQ9,  "llama-3.3-70b-versatile", 4096),
    makeProvider("groq10", "https://api.groq.com/openai/v1", process.env.GROQ10, "llama-3.3-70b-versatile", 4096),
    makeProvider("groq11", "https://api.groq.com/openai/v1", process.env.GROQ11, "llama-3.3-70b-versatile", 4096),
    // ── 兜底：Groq 额度用完后自动接管 ────────────────────────────────────
    makeProvider(
      "deepseek",
      "https://api.deepseek.com/v1",
      process.env.DEEPSEEK_API_KEY ?? process.env.DEEPSEEK,
      "deepseek-chat",
      8192,
    ),
  ];
  return list.filter((p): p is AiProvider => p !== null);
}

const providers: AiProvider[] = buildProviderList();

// ── Daily quota helpers ─────────────────────────────────────────────────────

function checkDailyReset(p: AiProvider): void {
  if (Date.now() >= p.dailyResetAt) {
    const prev = p.dailyCallCount;
    p.dailyCallCount = 0;
    p.dailyResetAt = nextMidnightUtc();
    if (prev > 0) {
      console.log(`[ai-provider] ${p.name} daily quota reset (UTC midnight). Was: ${prev}/${p.dailyCallLimit}`);
    }
  }
}

function isDailyExhausted(p: AiProvider): boolean {
  if (p.dailyCallLimit === 0) return false; // unlimited
  checkDailyReset(p);
  return p.dailyCallCount >= p.dailyCallLimit;
}

function isRateLimited(p: AiProvider): boolean {
  return p.rateLimitCooldownUntil > Date.now();
}

/** Increment daily call counter after a successful call */
function incrementDailyCount(p: AiProvider): void {
  checkDailyReset(p);
  p.dailyCallCount++;
  if (p.dailyCallLimit > 0 && p.dailyCallCount >= p.dailyCallLimit) {
    console.warn(
      `[ai-provider] ${p.name} daily quota EXHAUSTED: ${p.dailyCallCount}/${p.dailyCallLimit}. ` +
      `Resets in ${Math.ceil((p.dailyResetAt - Date.now()) / 3600000)}h (UTC midnight).`
    );
  }
}

// ── Public API ──────────────────────────────────────────────────────────────

/** Providers that are neither rate-limited nor daily-exhausted */
export function getAvailableProviders(): AiProvider[] {
  return providers.filter(p => !isRateLimited(p) && !isDailyExhausted(p));
}

/** True if any free provider has remaining daily quota AND is not rate-limited right now */
export function isFreeProviderAvailable(): boolean {
  return providers.some(p => p.name !== "deepseek" && !isRateLimited(p) && !isDailyExhausted(p));
}

/**
 * True when ALL configured free providers have exhausted their DAILY quota
 * (not just a temporary rate-limit cooldown).
 * This is the signal to activate DeepSeek fallback.
 */
export function areFreeProvidersDailyExhausted(): boolean {
  const free = providers.filter(p => p.name !== "deepseek");
  if (free.length === 0) return false;
  return free.every(p => isDailyExhausted(p));
}

/**
 * True when the DeepSeek $0.50/day budget has NOT yet been reached.
 * Used by auto-scraper.ts to gate hasUsableProvider() — prevents fingerprinting
 * articles when the only available provider (DeepSeek) is over budget.
 */
export function isDeepSeekBudgetAvailable(): boolean {
  // Trigger a midnight reset check first
  checkDeepSeekBudget("budget-check");
  return deepseekTotalDailyCost < DEEPSEEK_TOTAL_BUDGET;
}

/**
 * True when the current UTC hour bucket has remaining DeepSeek budget.
 * This is used by auto-scraper to avoid starting DeepSeek-only work when
 * the hourly slice (0.50/24) is already exhausted.
 */
export function isDeepSeekHourlyBudgetAvailable(): boolean {
  // Reuse budget gate which includes hourly + daily checks.
  return checkDeepSeekBudget("hourly-budget-check");
}

/** Returns today's DeepSeek call count (resets at UTC midnight) */
export function getDeepseekCallsToday(): number {
  const ds = providers.find(p => p.name === "deepseek");
  if (!ds) return 0;
  checkDailyReset(ds);
  return ds.dailyCallCount;
}

/** Daily quota statistics for monitoring */
export function getDailyQuotaStats(): Array<{
  name: string; used: number; limit: number | "unlimited";
  exhausted: boolean; rateLimitCooldownMins: number; resetInHours: number;
}> {
  return providers.map(p => {
    checkDailyReset(p);
    return {
      name: p.name,
      used: p.dailyCallCount,
      limit: p.dailyCallLimit === 0 ? "unlimited" : p.dailyCallLimit,
      exhausted: isDailyExhausted(p),
      rateLimitCooldownMins: Math.max(0, Math.ceil((p.rateLimitCooldownUntil - Date.now()) / 60000)),
      resetInHours: Math.ceil((p.dailyResetAt - Date.now()) / 3600000),
    };
  });
}

export function markProviderCooldown(name: string, isRateLimit = false): void {
  const p = providers.find(p => p.name === name);
  if (!p) return;
  p.rateLimitCooldownUntil = Date.now() + (isRateLimit ? RATE_LIMIT_COOLDOWN_MS : ERROR_COOLDOWN_MS);
  console.warn(`[ai-provider] ${name} rate-limit cooldown for ${isRateLimit ? "10min" : "30s"}`);
}

/** Force-mark a provider as daily-exhausted (e.g. when 429 says "tokens per day") */
export function markProviderDailyExhausted(name: string): void {
  const p = providers.find(p => p.name === name);
  if (!p || p.dailyCallLimit === 0) return;
  p.dailyCallCount = p.dailyCallLimit; // set to max so isDailyExhausted() returns true
  console.warn(`[ai-provider] ${name} marked daily-exhausted (daily limit hit). Resets at UTC midnight.`);
  // Persist so that a restart won't re-attempt this key until tomorrow UTC.
  const today = todayUtc();
  db.execute(sql`
    INSERT INTO provider_daily_exhausted (date, provider_name)
    VALUES (${today}, ${name})
    ON CONFLICT (date, provider_name) DO NOTHING
  `).catch(() => {/* non-fatal */});
}

export function logProviderStatus(): void {
  const stats = getDailyQuotaStats();
  const status = stats.map(s => {
    const parts: string[] = [];
    if (s.exhausted) parts.push(`daily-exhausted(resets ${s.resetInHours}h)`);
    else parts.push(`daily:${s.used}/${s.limit}`);
    if (s.rateLimitCooldownMins > 0) parts.push(`rate-limit:${s.rateLimitCooldownMins}min`);
    return `${s.name}(${parts.join(", ")})`;
  });
  console.log(`[ai-provider] ${status.join(" | ")}`);
}

// ── Forced provider (dedicated per-provider crons) ───────────────────────────
// When set, callAiWithFallback uses ONLY this provider — no fallback.
// If the forced provider is rate-limited or daily-exhausted, returns null immediately.
let _forcedProviderName: string | null = null;

export function setForcedProvider(name: string | null): void {
  _forcedProviderName = name;
}

/**
 * Call AI with provider fallback.
 *
 * @param freeOnly
 *   true  → Use free/credit providers only (Groq→Cerebras→SambaNova→OpenRouter→Together→Fireworks→Novita).
 *           - If ALL are on RATE-LIMIT cooldown → skip batch (return null)
 *           - If ALL are DAILY-EXHAUSTED → fall through to DeepSeek
 *   false → Use any available provider in order, DeepSeek as last resort.
 *
 * If setForcedProvider() has been called, ignores freeOnly and uses only that provider.
 */
export async function callAiWithFallback(
  messages: OpenAI.Chat.ChatCompletionMessageParam[],
  maxTokens = 8192,
  temperature = 0.2,
  freeOnly = false,
  category = "other",
  paidOnly = false,  // When true: skip all free (Groq) providers; use DeepSeek exclusively
): Promise<string | null> {
  // Check all daily resets first
  providers.forEach(checkDailyReset);

  // ── Forced-provider mode (dedicated crons) ─────────────────────────────────
  if (_forcedProviderName) {
    const forced = providers.find(p => p.name === _forcedProviderName);
    if (!forced) {
      console.warn(`[ai-provider] Forced provider "${_forcedProviderName}" not configured — skipping.`);
      return null;
    }
    checkDailyReset(forced);
    if (isDailyExhausted(forced)) {
      console.log(`[ai-provider] [${forced.name}] daily quota exhausted — skipping batch.`);
      return null;
    }
    if (isRateLimited(forced)) {
      console.log(`[ai-provider] [${forced.name}] rate-limited — skipping batch.`);
      return null;
    }
    if (forced.name === "deepseek" && !checkDeepSeekBudget(category)) {
      console.warn(`[DeepSeek Budget] forced 模式 ${category} 预算已满，跳过`);
      return null;
    }
    try {
      const completion = await forced.client.chat.completions.create({
        model: forced.model,
        max_tokens: Math.min(maxTokens, forced.maxTokens),
        messages,
        temperature,
      });
      const content = completion.choices[0]?.message?.content ?? null;
      if (content) {
        incrementDailyCount(forced);
        if (forced.name === "deepseek" && completion.usage) {
          recordDeepSeekCost(category, completion.usage.prompt_tokens, completion.usage.completion_tokens);
        }
        return content;
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      const msgLower = msg.toLowerCase();
      const isDailyLimit = msgLower.includes("per day") || msgLower.includes("tokens per day") ||
        msgLower.includes("requests per day") || msgLower.includes("day_limit") || msgLower.includes("daily limit");
      const isRateLimit = !isDailyLimit && (
        msg.includes("429") || msgLower.includes("rate limit") ||
        msgLower.includes("quota") || msgLower.includes("resource_exhausted")
      );
      console.warn(`[ai-provider] [${forced.name}] failed: ${msg.slice(0, 180)}`);
      if (isDailyLimit) markProviderDailyExhausted(forced.name);
      else markProviderCooldown(forced.name, isRateLimit);
    }
    return null;
  }
  // ── End forced-provider mode ───────────────────────────────────────────────

  let available = getAvailableProviders();

  if (paidOnly) {
    // Reserve Groq exclusively for flash scraper — other scrapers use DeepSeek only
    available = available.filter(p => p.name === "deepseek");
  } else if (freeOnly) {
    // freeOnly=true is used by: (a) Groq flash keyword scraper, (b) main RSS cron.
    // The Groq flash is gate-kept by hasUsableProvider() in auto-scraper.ts, which already
    // ensures this function is only called when a free Groq key is actually available.
    // The main RSS cron needs the DeepSeek fallback when all Groq keys are daily-exhausted.
    const freeProviders = providers.filter(p => p.name !== "deepseek");
    const freeExhausted = freeProviders.length > 0 && freeProviders.every(isDailyExhausted);
    const freeOnRateLimit = freeProviders.every(isRateLimited);
    const freeAvailable = freeProviders.filter(p => !isRateLimited(p) && !isDailyExhausted(p));

    if (freeExhausted) {
      // All Groq keys daily-exhausted → DeepSeek fallback (main RSS cron needs this)
      console.log("[ai-provider] Free providers daily-exhausted → using DeepSeek fallback");
      // available already includes DeepSeek
    } else if (freeOnRateLimit || freeAvailable.length === 0) {
      // Temporary rate-limit → skip; next cycle will retry
      console.log("[ai-provider] Free providers on rate-limit cooldown — skipping batch");
      return null;
    } else {
      available = freeAvailable;
    }
  }

  if (available.length === 0) {
    console.error("[ai-provider] All providers unavailable (rate-limited or daily-exhausted).");
    return null;
  }

  for (const provider of available) {
    // Groq 6-hour slot check — skip if current slot is full, fall through to DeepSeek
    if (provider.name === "groq" && isGroqSlotFull()) {
      const slotUsed = groqSlotCounts.get(getGroqSlotStart()) ?? 0;
      console.log(`[ai-provider] Groq 当前6小时窗口已达上限 (${slotUsed}/${GROQ_MAX_PER_6H})，切换到 DeepSeek`);
      continue;
    }
    // DeepSeek 预算检查
    if (provider.name === "deepseek" && !checkDeepSeekBudget(category)) {
      console.warn(`[DeepSeek Budget] fallback 中 ${category} 预算已满，跳过`);
      continue;
    }
    try {
      const completion = await provider.client.chat.completions.create({
        model: provider.model,
        max_tokens: Math.min(maxTokens, provider.maxTokens),
        messages,
        temperature,
      });
      const content = completion.choices[0]?.message?.content ?? null;
      if (content) {
        if (available[0].name !== provider.name) {
          console.log(`[ai-provider] Used fallback provider: ${provider.name}`);
        }
        incrementDailyCount(provider);
        if (provider.name === "groq") incrementGroqSlot();
        if (provider.name === "deepseek" && completion.usage) {
          recordDeepSeekCost(category, completion.usage.prompt_tokens, completion.usage.completion_tokens);
        }
        return content;
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      const msgLower = msg.toLowerCase();
      const isBadRequest = msg.includes("400") || msgLower.includes("bad request");
      const isDailyLimit =
        msgLower.includes("per day") ||
        msgLower.includes("tokens per day") ||
        msgLower.includes("requests per day") ||
        msgLower.includes("day_limit") ||
        msgLower.includes("daily limit");
      const isRateLimit =
        !isDailyLimit && (
          msg.includes("429") ||
          msgLower.includes("rate limit") ||
          msgLower.includes("quota") ||
          msgLower.includes("resource_exhausted")
        );
      console.warn(`[ai-provider] ${provider.name} failed: ${msg.slice(0, 180)}`);
      if (isBadRequest) {
        // 400 = client-side / content-policy error — no cooldown, just skip
        console.warn(`[ai-provider] ${provider.name} returned 400 — skipping (no cooldown)`);
      } else if (isDailyLimit) {
        // Daily quota exhausted — mark exhausted until UTC midnight reset
        markProviderDailyExhausted(provider.name);
      } else {
        markProviderCooldown(provider.name, isRateLimit);
      }
    }
  }

  console.error("[ai-provider] All providers failed for this request.");
  return null;
}
