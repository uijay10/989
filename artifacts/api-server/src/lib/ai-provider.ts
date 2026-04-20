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

// ==================== DeepSeek：仅按 UTC 自然小时上限（无 24h 总预算）====================
// 应用内估算花费封顶（与 DeepSeek 控制台余额无关）。未设置时默认 0.05 USD/UTC 小时，与历史行为一致。
// DEEPSEEK_HOURLY_BUDGET_USD=0 表示关闭应用层小时上限。
// 花费持久化到 ai_cost_hourly_bucket（bucket_key = `YYYY-MM-DDTHH` UTC），重启后按当前小时恢复。
const DEEPSEEK_HOURLY_BUDGET_USD: number = (() => {
  const raw = process.env.DEEPSEEK_HOURLY_BUDGET_USD;
  if (raw === "0") return 0;
  const v = parseFloat(raw ?? "0.05");
  if (!Number.isFinite(v) || v < 0) return 0.05;
  return v;
})();

let deepseekBudgetInitialized = false;
let deepseekHourlyCost = 0;
let deepseekHourBucketKey = "";

/** UTC 自然小时桶键，例如 2026-04-18T08 */
function utcHourBucketKey(nowMs: number): string {
  const d = new Date(nowMs);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  const h = String(d.getUTCHours()).padStart(2, "0");
  return `${y}-${m}-${day}T${h}`;
}

function syncDeepSeekUtcHourBucket(nowMs: number): void {
  const key = utcHourBucketKey(nowMs);
  if (key === deepseekHourBucketKey) return;
  deepseekHourBucketKey = key;
  deepseekHourlyCost = 0;
}

/** 供 /api/auto-scrape/status 等展示当前小时上限（0 = 应用层不限制） */
export function getDeepSeekHourlyBudgetUsd(): number {
  return DEEPSEEK_HOURLY_BUDGET_USD;
}

export function getDeepSeekHourlySpendUsd(): number {
  return deepseekHourlyCost;
}

/** 应用层小时上限是否关闭（DEEPSEEK_HOURLY_BUDGET_USD=0） */
export function isDeepSeekHourlyCapDisabled(): boolean {
  return DEEPSEEK_HOURLY_BUDGET_USD <= 0;
}

/** 供 health：是否因应用层小时封顶而无法再调 DeepSeek（与账户余额无关） */
export function isDeepSeekBlockedByAppHourlyCap(): boolean {
  if (!deepseekBudgetInitialized) return false;
  if (DEEPSEEK_HOURLY_BUDGET_USD <= 0) return false;
  return deepseekHourlyCost >= DEEPSEEK_HOURLY_BUDGET_USD;
}

async function ensureDeepSeekBudgetTables(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS deepseek_budget_anchor (
      id INTEGER PRIMARY KEY DEFAULT 1,
      anchor_ms BIGINT NOT NULL
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS ai_cost_window (
      window_key TEXT PRIMARY KEY,
      deepseek_cost_usd REAL NOT NULL DEFAULT 0
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS ai_cost_hourly_bucket (
      bucket_key TEXT PRIMARY KEY,
      deepseek_cost_usd REAL NOT NULL DEFAULT 0
    )
  `);
}

function formatIso(tsMs: number): string {
  try { return new Date(tsMs).toISOString(); } catch { return String(tsMs); }
}

/** 启动时从数据库恢复当前 UTC 小时桶花费 */
export async function initDeepSeekDailyBudget(): Promise<void> {
  try {
    await ensureDeepSeekBudgetTables();

    deepseekHourBucketKey = utcHourBucketKey(Date.now());
    const hourResult = await db.execute(sql`
      SELECT deepseek_cost_usd FROM ai_cost_hourly_bucket WHERE bucket_key = ${deepseekHourBucketKey}
    `);
    if ((hourResult as any).rows?.length > 0) {
      deepseekHourlyCost = Number(((hourResult as any).rows[0] as any).deepseek_cost_usd ?? 0);
      const capLine =
        DEEPSEEK_HOURLY_BUDGET_USD <= 0
          ? "应用层小时上限：关闭"
          : `上限 $${DEEPSEEK_HOURLY_BUDGET_USD.toFixed(2)}/h（UTC）`;
      console.log(
        `[DeepSeek Budget] UTC 小时桶 ${deepseekHourBucketKey}：已用 $${deepseekHourlyCost.toFixed(4)} | ${capLine}`
      );
    } else {
      deepseekHourlyCost = 0;
      const capLine =
        DEEPSEEK_HOURLY_BUDGET_USD <= 0
          ? "应用层小时上限：关闭"
          : `上限 $${DEEPSEEK_HOURLY_BUDGET_USD.toFixed(2)}/h（UTC）`;
      console.log(`[DeepSeek Budget] UTC 小时桶 ${deepseekHourBucketKey} 首次记录 | ${capLine}`);
    }

    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    db.execute(sql`
      DELETE FROM ai_cost_hourly_bucket
      WHERE bucket_key ~ '^[0-9]+-[0-9]+$'
        AND CAST(split_part(bucket_key, '-', 1) AS BIGINT) < ${weekAgo}
    `).catch(() => {/* non-fatal */});

    deepseekBudgetInitialized = true;

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS provider_daily_exhausted (
        date TEXT NOT NULL,
        provider_name TEXT NOT NULL,
        PRIMARY KEY (date, provider_name)
      )
    `);
    const today = todayUtc();
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
    console.warn("[DeepSeek Budget] 无法从数据库加载小时成本，从 $0 开始:", e);
    deepseekBudgetInitialized = true;
  }
}

function persistDeepSeekHourlyCost(): void {
  const key = deepseekHourBucketKey;
  if (!key) return;
  const cost = deepseekHourlyCost;
  db.execute(sql`
    INSERT INTO ai_cost_hourly_bucket (bucket_key, deepseek_cost_usd)
    VALUES (${key}, ${cost})
    ON CONFLICT (bucket_key) DO UPDATE SET deepseek_cost_usd = ${cost}
  `).catch(() => {/* 非致命，忽略 */});
}

/** 将当前 UTC 小时桶花费清零（管理接口） */
export async function resetDeepSeekBudgetNow(): Promise<void> {
  await ensureDeepSeekBudgetTables();
  deepseekHourBucketKey = utcHourBucketKey(Date.now());
  deepseekHourlyCost = 0;
  await db.execute(sql`
    INSERT INTO ai_cost_hourly_bucket (bucket_key, deepseek_cost_usd)
    VALUES (${deepseekHourBucketKey}, 0)
    ON CONFLICT (bucket_key) DO UPDATE SET deepseek_cost_usd = 0
  `).catch(() => {});
  console.log(`[DeepSeek Budget] 管理员重置：UTC 小时桶 ${deepseekHourBucketKey} 已清零`);
}

function checkDeepSeekBudget(_category: string): boolean {
  if (!deepseekBudgetInitialized) return true;
  if (DEEPSEEK_HOURLY_BUDGET_USD <= 0) return true;
  const nowMs = Date.now();
  syncDeepSeekUtcHourBucket(nowMs);
  if (deepseekHourlyCost >= DEEPSEEK_HOURLY_BUDGET_USD) {
    console.warn(
      `[DeepSeek Budget] 本 UTC 小时应用层封顶 $${DEEPSEEK_HOURLY_BUDGET_USD.toFixed(4)}（估算已用 $${deepseekHourlyCost.toFixed(4)}，桶=${deepseekHourBucketKey}）。` +
        ` 提高/关闭请设 DEEPSEEK_HOURLY_BUDGET_USD（0=不限制）。`
    );
    return false;
  }
  return true;
}

function recordDeepSeekCost(_category: string, inputTokens: number, outputTokens: number): void {
  const cost = (inputTokens * 0.27 + outputTokens * 1.10) / 1_000_000;
  const nowMs = Date.now();
  syncDeepSeekUtcHourBucket(nowMs);
  deepseekHourlyCost += cost;
  const cap =
    DEEPSEEK_HOURLY_BUDGET_USD <= 0 ? "无应用层上限" : `$${DEEPSEEK_HOURLY_BUDGET_USD.toFixed(2)}`;
  console.log(`[DeepSeek Cost] 本次 $${cost.toFixed(5)} | UTC 小时 ${deepseekHourBucketKey} 累计 $${deepseekHourlyCost.toFixed(4)} / ${cap}`);
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

function todayUtc(): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function makeProvider(
  name: string,
  baseURL: string,
  apiKey: string | undefined,
  model: string,
  maxTokens: number,
): AiProvider | null {
  if (!apiKey) return null;
  const limit = (DAILY_LIMITS[name] ?? (/^groq\d+$/i.test(name) ? 1000 : 0));
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
    // ── Groq 备用 Key 轮换：自动读取 GROQ1..GROQ50 ───────────────────────
    // 这样你后续加 GROQ12/GROQ13/... 不需要再改代码。
    ...Array.from({ length: 50 }, (_, idx) => {
      const i = idx + 1;
      return makeProvider(
        `groq${i}`,
        "https://api.groq.com/openai/v1",
        process.env[`GROQ${i}`],
        "llama-3.3-70b-versatile",
        4096,
      );
    }),
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
 */
export function areFreeProvidersDailyExhausted(): boolean {
  const free = providers.filter(p => p.name !== "deepseek");
  if (free.length === 0) return false;
  return free.every(p => isDailyExhausted(p));
}

/**
 * True when DeepSeek is under the **UTC hourly** USD cap (see DEEPSEEK_HOURLY_BUDGET_USD).
 * Used by auto-scraper to gate hasUsableProvider() — no separate 24h total budget.
 */
export function isDeepSeekBudgetAvailable(): boolean {
  return checkDeepSeekBudget("budget-check");
}

/** True if a `paidOnly` unified scrape could run (DeepSeek configured, not blocked, hourly budget OK). */
export function canRunPaidUnifiedScrape(): boolean {
  const ds = providers.find(p => p.name === "deepseek");
  if (!ds) return false;
  checkDailyReset(ds);
  if (isRateLimited(ds) || isDailyExhausted(ds)) return false;
  return isDeepSeekBudgetAvailable();
}

/** Human-readable reason when paid DeepSeek unified scrape cannot run (for logs / ops). Separate from your DeepSeek account hourly quota. */
export function explainWhyPaidDeepSeekBlocked(): string | null {
  const ds = providers.find(p => p.name === "deepseek");
  if (!ds) {
    return "DeepSeek not configured (set DEEPSEEK_API_KEY or DEEPSEEK)";
  }
  checkDailyReset(ds);
  if (isRateLimited(ds)) return "DeepSeek rate-limit cooldown";
  if (isDailyExhausted(ds)) return "DeepSeek marked daily exhausted";
  if (!isDeepSeekBudgetAvailable()) {
    if (isDeepSeekHourlyCapDisabled()) return "App hourly cap disabled but budget check failed (bug)";
    return `App-side hourly USD cap (DEEPSEEK_HOURLY_BUDGET_USD=${getDeepSeekHourlyBudgetUsd()}); set to 0 to rely only on DeepSeek billing`;
  }
  return null;
}

/** @deprecated Same as isDeepSeekBudgetAvailable (hourly-only cap). */
export function isDeepSeekHourlyBudgetAvailable(): boolean {
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
    // freeOnly: Groq cron only — never call DeepSeek here (paid DeepSeek runs on its own schedule).
    const freeAvailable = providers
      .filter(p => p.name !== "deepseek")
      .filter(p => !isRateLimited(p) && !isDailyExhausted(p));
    if (freeAvailable.length === 0) {
      console.log("[ai-provider] No usable free Groq provider — skipping batch (freeOnly)");
      return null;
    }
    available = freeAvailable;
  }

  if (available.length === 0) {
    console.error("[ai-provider] All providers unavailable (rate-limited or daily-exhausted).");
    return null;
  }

  for (const provider of available) {
    // Groq 6-hour slot check — skip if current slot is full, try next Groq key (freeOnly has no DeepSeek).
    if (provider.name === "groq" && isGroqSlotFull()) {
      const slotUsed = groqSlotCounts.get(getGroqSlotStart()) ?? 0;
      console.log(`[ai-provider] Groq 当前6小时窗口已达上限 (${slotUsed}/${GROQ_MAX_PER_6H})，跳过本 key`);
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
