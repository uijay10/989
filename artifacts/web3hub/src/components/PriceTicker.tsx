import { useEffect, useRef, useState, useCallback } from "react";
import { useLang } from "@/lib/i18n";
import { pushPriceAlert } from "@/lib/priceAlerts";

/* ── Coin definitions ──────────────────────────────────── */
// Displayed in row 1 (no flash)
const MAIN_COINS  = ["btcusdt", "ethusdt", "solusdt", "bnbusdt", "linkusdt", "uniusdt", "trxusdt"];
// Displayed in row 2 (with flash)
const EXTRA_COINS = ["suiusdt", "dogeusdt", "xrpusdt", "aptusdt", "arbusdt", "opusdt", "bchusdt"];
// Tracked via WebSocket for alerts only, not rendered
const HIDDEN_COINS = ["ltcusdt", "avaxusdt", "dotusdt", "injusdt", "nearusdt", "tonusdt", "atomusdt", "adausdt", "pepeusdt", "etcusdt", "shibusdt"];
const ALL_COINS   = [...MAIN_COINS, ...EXTRA_COINS, ...HIDDEN_COINS];

const COIN_LABELS: Record<string, string> = {
  btcusdt:  "BTC",  ethusdt:  "ETH",  solusdt:  "SOL",  bnbusdt:  "BNB",
  linkusdt: "LINK", ltcusdt:  "LTC",  uniusdt:  "UNI",  trxusdt:  "TRX",
  avaxusdt: "AVAX", suiusdt:  "SUI",  tonusdt:  "TON",  dogeusdt: "DOGE",
  xrpusdt:  "XRP",  adausdt:  "ADA",  nearusdt: "NEAR", aptusdt:  "APT",
  dotusdt:  "DOT",  injusdt:  "INJ",  atomusdt: "ATOM", arbusdt:  "ARB",
  opusdt:   "OP",   pepeusdt: "PEPE", etcusdt:  "ETC",  shibusdt: "SHIB",
  bchusdt:  "BCH",
};

const CHANGE_THRESHOLD = 1.0;
const TIME_WINDOW      = 60;

interface PriceEntry { time: number; price: number; }

interface CoinState {
  price:     number | null;
  change24h: number | null;
  change1m:  number | null;
  flash:     "up" | "down" | null;
}

function getPsychologicalLevel(price: number): number {
  if (price <= 0) return 0;
  let step: number;
  if      (price < 10)    return Math.round(Math.round(price / 0.5) * 0.5 * 100) / 100;
  else if (price < 100)   { step = 5; }
  else if (price < 1000)  { step = 10; }
  else if (price < 5000)  { step = 50; }
  else if (price < 10000) { step = 100; }
  else if (price < 50000) { step = 500; }
  else                    { step = 1000; }
  return Math.round(Math.round(price / step) * step);
}

function fmt(price: number): string {
  if (price >= 1000)   return price.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (price >= 1)      return price.toFixed(2);
  if (price >= 0.01)   return price.toFixed(4);
  if (price >= 0.0001) return price.toFixed(6);
  return price.toFixed(8);
}

const initialState = (): Record<string, CoinState> =>
  Object.fromEntries(ALL_COINS.map(c => [c, { price: null, change24h: null, change1m: null, flash: null }]));

/* ── Change badge ──────────────────────────────────────── */
function ChangeBadge({ pct }: { pct: number | null }) {
  if (pct === null) return null;
  const up = pct >= 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[10px] font-bold px-1 py-0.5 rounded leading-none tabular-nums ${
      up
        ? "bg-emerald-500/15 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400"
        : "bg-red-500/15 text-red-500 dark:bg-red-500/20 dark:text-red-400"
    }`}>
      {up ? "▲" : "▼"}{Math.abs(pct).toFixed(2)}%
    </span>
  );
}

export function PriceTicker() {
  const { lang } = useLang();
  const zh = lang === "zh-CN";

  const [coins, setCoins]     = useState<Record<string, CoinState>>(initialState);
  const [connected, setConnected] = useState(false);

  const historyRef   = useRef<Record<string, PriceEntry[]>>(Object.fromEntries(ALL_COINS.map(c => [c, []])));
  const lastAlertRef = useRef<Record<string, number>>(Object.fromEntries(ALL_COINS.map(c => [c, 0])));
  const lastLevelRef = useRef<Record<string, number | null>>(Object.fromEntries(ALL_COINS.map(c => [c, null])));
  const prevPriceRef = useRef<Record<string, number | null>>(Object.fromEntries(ALL_COINS.map(c => [c, null])));
  const flashTimers  = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const wsRef        = useRef<WebSocket | null>(null);

  const clearFlash = useCallback((symbol: string) => {
    if (flashTimers.current[symbol]) clearTimeout(flashTimers.current[symbol]);
    flashTimers.current[symbol] = setTimeout(() => {
      setCoins(prev => ({ ...prev, [symbol]: { ...prev[symbol], flash: null } }));
    }, 2000);
  }, []);

  useEffect(() => {
    let alive = true;
    let reconnectTimer: ReturnType<typeof setTimeout>;

    function connect() {
      if (!alive) return;
      const streams = ALL_COINS.map(c => `${c}@ticker`).join("/");
      const ws = new WebSocket(`wss://stream.binance.com:9443/stream?streams=${streams}`);
      wsRef.current = ws;

      ws.onopen  = () => setConnected(true);
      ws.onclose = () => { setConnected(false); if (alive) reconnectTimer = setTimeout(connect, 5000); };
      ws.onerror = () => ws.close();

      ws.onmessage = (ev) => {
        try {
          const msg    = JSON.parse(ev.data as string);
          const ticker = msg?.data;
          if (!ticker) return;

          const symbol: string = (ticker.s ?? "").toLowerCase();
          if (!ALL_COINS.includes(symbol)) return;

          const currentPrice = parseFloat(ticker.c);
          const change24h    = parseFloat(ticker.P);
          if (isNaN(currentPrice)) return;

          // Flash direction from prev price
          const prev = prevPriceRef.current[symbol];
          let flash: "up" | "down" | null = null;
          if (prev !== null && prev !== currentPrice) {
            flash = currentPrice > prev ? "up" : "down";
          }
          prevPriceRef.current[symbol] = currentPrice;

          const now  = Date.now() / 1000;
          const hist = historyRef.current[symbol];
          hist.push({ time: now, price: currentPrice });
          while (hist.length > 0 && hist[0].time < now - TIME_WINDOW) hist.shift();

          let change1m: number | null = null;

          // 1-minute % change alert (main coins)
          if (MAIN_COINS.includes(symbol) && hist.length >= 2) {
            const oldest = hist[0];
            if (now - oldest.time >= 15) {
              change1m = ((currentPrice - oldest.price) / oldest.price) * 100;
              if (Math.abs(change1m) >= CHANGE_THRESHOLD && now - lastAlertRef.current[symbol] > 60) {
                lastAlertRef.current[symbol] = now;
                pushPriceAlert({
                  symbol, kind: "pct",
                  change1m, change24h: isNaN(change24h) ? 0 : change24h,
                  price: currentPrice, ts: Date.now(),
                });
              }
            }
          }

          // Psychological level break (all coins)
          const currentLevel = getPsychologicalLevel(currentPrice);
          const prevLevel    = lastLevelRef.current[symbol];
          if (prevLevel !== null && prevLevel !== currentLevel) {
            pushPriceAlert({
              symbol,
              kind: currentPrice > prevLevel ? "level_up" : "level_down",
              level: currentLevel,
              change24h: isNaN(change24h) ? 0 : change24h,
              price: currentPrice, ts: Date.now(),
            });
          }
          lastLevelRef.current[symbol] = currentLevel;

          setCoins(prev => ({
            ...prev,
            [symbol]: {
              price: currentPrice,
              change24h: isNaN(change24h) ? prev[symbol].change24h : change24h,
              change1m,
              flash: flash ?? prev[symbol].flash,
            },
          }));

          if (flash) clearFlash(symbol);
        } catch { /* ignore */ }
      };
    }

    connect();
    return () => {
      alive = false;
      clearTimeout(reconnectTimer);
      wsRef.current?.close();
      Object.values(flashTimers.current).forEach(clearTimeout);
    };
  }, [clearFlash]);

  return (
    <div className="flex flex-col gap-2 notranslate" translate="no">
      {/* Row 1: live indicator + main coins */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className="flex items-center gap-1 text-[11px] text-slate-400 shrink-0">
          <span className={`w-1.5 h-1.5 rounded-full ${connected ? "bg-emerald-400 animate-pulse" : "bg-slate-400"}`} />
          {connected ? (zh ? "实时" : "Live") : (zh ? "连接中…" : "Connecting…")}
        </span>

        {MAIN_COINS.map(symbol => {
          const { price, change24h } = coins[symbol];
          return (
            <div key={symbol} className="flex items-center gap-1 shrink-0">
              <span className="text-[13px] font-bold text-slate-700 dark:text-slate-100">{COIN_LABELS[symbol]}</span>
              <span className="text-[13px] font-semibold text-slate-800 dark:text-slate-200 tabular-nums">
                {price !== null ? `$${fmt(price)}` : "—"}
              </span>
              <ChangeBadge pct={change24h} />
            </div>
          );
        })}
      </div>

      {/* Row 2: extra coins with flash + 24h badge */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        {EXTRA_COINS.map(symbol => {
          const { price, change24h, flash } = coins[symbol];
          const priceCls = flash === "up"
            ? "text-emerald-500 dark:text-emerald-400 animate-[flashGreen_2s_ease-out_forwards]"
            : flash === "down"
            ? "text-red-500 dark:text-red-400 animate-[flashRed_2s_ease-out_forwards]"
            : "text-slate-800 dark:text-slate-200";
          return (
            <div key={symbol} className="flex items-center gap-1 shrink-0">
              <span className="text-[12px] font-bold text-slate-700 dark:text-slate-100">{COIN_LABELS[symbol]}</span>
              <span className={`text-[12px] font-semibold tabular-nums transition-colors duration-700 ${priceCls}`}>
                {price !== null ? `$${fmt(price)}` : "—"}
              </span>
              <ChangeBadge pct={change24h} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
