import { useSyncExternalStore } from "react";
import { subscribePriceAlerts, getPriceAlerts, PriceAlertMsg } from "@/lib/priceAlerts";
import { useLang } from "@/lib/i18n";

const COIN_NAMES_ZH: Record<string, string> = {
  btcusdt:  "比特币(BTC)",   ethusdt:  "以太坊(ETH)",      solusdt:  "Solana(SOL)",
  bnbusdt:  "币安币(BNB)",   linkusdt: "Chainlink(LINK)",  dotusdt:  "波卡(DOT)",
  ltcusdt:  "莱特币(LTC)",   uniusdt:  "Uniswap(UNI)",     avaxusdt: "Avalanche(AVAX)",
  suiusdt:  "Sui(SUI)",      tonusdt:  "Toncoin(TON)",     dogeusdt: "狗狗币(DOGE)",
  xrpusdt:  "瑞波币(XRP)",   adausdt:  "卡尔达诺(ADA)",    nearusdt: "NEAR(NEAR)",
  aptusdt:  "Aptos(APT)",    injusdt:  "Injective(INJ)",   atomusdt: "Cosmos(ATOM)",
  arbusdt:  "Arbitrum(ARB)", opusdt:   "Optimism(OP)",     pepeusdt: "Pepe(PEPE)",
  etcusdt:  "以太坊经典(ETC)", shibusdt: "柴犬币(SHIB)",
};
const COIN_NAMES_EN: Record<string, string> = {
  btcusdt:  "Bitcoin (BTC)",   ethusdt:  "Ethereum (ETH)",    solusdt:  "Solana (SOL)",
  bnbusdt:  "BNB (BNB)",       linkusdt: "Chainlink (LINK)",  dotusdt:  "Polkadot (DOT)",
  ltcusdt:  "Litecoin (LTC)",  uniusdt:  "Uniswap (UNI)",     avaxusdt: "Avalanche (AVAX)",
  suiusdt:  "Sui (SUI)",       tonusdt:  "Toncoin (TON)",     dogeusdt: "Dogecoin (DOGE)",
  xrpusdt:  "XRP (XRP)",       adausdt:  "Cardano (ADA)",     nearusdt: "NEAR (NEAR)",
  aptusdt:  "Aptos (APT)",     injusdt:  "Injective (INJ)",   atomusdt: "Cosmos (ATOM)",
  arbusdt:  "Arbitrum (ARB)",  opusdt:   "Optimism (OP)",     pepeusdt: "Pepe (PEPE)",
  etcusdt:  "Ethereum Classic (ETC)",    shibusdt: "Shiba Inu (SHIB)",
};
const COIN_SHORT: Record<string, string> = {
  btcusdt:  "BTC",  ethusdt:  "ETH",  solusdt:  "SOL",  bnbusdt:  "BNB",
  linkusdt: "LINK", dotusdt:  "DOT",  ltcusdt:  "LTC",  uniusdt:  "UNI",
  avaxusdt: "AVAX", suiusdt:  "SUI",  tonusdt:  "TON",  dogeusdt: "DOGE",
  xrpusdt:  "XRP",  adausdt:  "ADA",  nearusdt: "NEAR", aptusdt:  "APT",
  injusdt:  "INJ",  atomusdt: "ATOM", arbusdt:  "ARB",  opusdt:   "OP",
  pepeusdt: "PEPE", etcusdt:  "ETC",  shibusdt: "SHIB",
};

function fmt(price: number): string {
  if (price >= 1000)   return price.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (price >= 1)      return price.toFixed(2);
  if (price >= 0.01)   return price.toFixed(4);
  if (price >= 0.0001) return price.toFixed(6);
  return price.toFixed(8);
}

function fmtTime(ts: number): string {
  const d = new Date(ts);
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

function buildContent(a: PriceAlertMsg, zh: boolean): { title: string; body: string; isUp: boolean } {
  const symbol = a.symbol;
  const coinZH = COIN_NAMES_ZH[symbol] ?? COIN_SHORT[symbol];
  const coinEN = COIN_NAMES_EN[symbol] ?? COIN_SHORT[symbol];
  const coin   = zh ? coinZH : coinEN;
  const short  = COIN_SHORT[symbol];
  const price  = fmt(a.price);
  const ch24   = a.change24h != null ? Math.abs(a.change24h).toFixed(2) : null;
  const isUp   = a.kind === "level_up" || (a.kind === "pct" && (a.change1m ?? 0) > 0);

  if (a.kind === "level_up") {
    const level = (a.level ?? 0).toLocaleString();
    const title = zh
      ? `${short}突破${level}美元`
      : `${short} Breaks $${level}`;
    const body  = zh
      ? `行情显示，${coin}向上突破${level}美元整数关口，现报${price}美元${ch24 ? `，24小时涨幅达到${ch24}%` : ""}，行情波动较大，请做好风险控制。`
      : `${coin} broke above the $${level} key level. Current price: $${price}.${ch24 ? ` 24h gain: +${ch24}%.` : ""} High volatility — manage risk accordingly.`;
    return { title, body, isUp };
  }

  if (a.kind === "level_down") {
    const level = (a.level ?? 0).toLocaleString();
    const title = zh
      ? `${short}跌破${level}美元`
      : `${short} Falls Below $${level}`;
    const body  = zh
      ? `行情显示，${coin}跌破${level}美元整数关口，现报${price}美元${ch24 ? `，24小时跌幅达到${ch24}%` : ""}，行情波动较大，请做好风险控制。`
      : `${coin} fell below the $${level} key level. Current price: $${price}.${ch24 ? ` 24h drop: -${ch24}%.` : ""} High volatility — manage risk accordingly.`;
    return { title, body, isUp };
  }

  // pct
  const pct   = Math.abs(a.change1m ?? 0).toFixed(2);
  if (isUp) {
    const title = zh ? `${short}1分钟内急涨${pct}%` : `${short} Surges ${pct}% in 1 Min`;
    const body  = zh
      ? `行情显示，${coin}1分钟内急涨${pct}%，现报${price}美元${ch24 ? `，24小时涨幅达到${Math.abs(a.change24h!).toFixed(2)}%` : ""}，行情波动较大，请做好风险控制。`
      : `${coin} surged ${pct}% in 1 minute. Current price: $${price}.${ch24 ? ` 24h gain: +${ch24}%.` : ""} High volatility — manage risk accordingly.`;
    return { title, body, isUp };
  } else {
    const title = zh ? `${short}1分钟内急跌${pct}%` : `${short} Drops ${pct}% in 1 Min`;
    const body  = zh
      ? `行情显示，${coin}1分钟内急跌${pct}%，现报${price}美元${ch24 ? `，24小时跌幅达到${ch24}%` : ""}，行情波动较大，请做好风险控制。`
      : `${coin} dropped ${pct}% in 1 minute. Current price: $${price}.${ch24 ? ` 24h drop: -${ch24}%.` : ""} High volatility — manage risk accordingly.`;
    return { title, body, isUp };
  }
}

export function PriceAlertCards() {
  const { lang } = useLang();
  const zh = lang === "zh-CN";

  const alerts = useSyncExternalStore(
    subscribePriceAlerts,
    getPriceAlerts,
    getPriceAlerts,
  );

  if (alerts.length === 0) return null;

  return (
    <div className="space-y-2">
      {alerts.map(a => {
        const { title, body, isUp } = buildContent(a, zh);
        return (
          <div
            key={a.id}
            className="rounded-xl border bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 px-4 py-3 shadow-sm"
          >
            {/* time + source tag */}
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-[11px] text-slate-400">{fmtTime(a.ts)}</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                {zh ? "行情速报" : "Market Alert"}
              </span>
            </div>

            {/* title */}
            <p className={`text-sm font-bold mb-1 ${isUp ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400"}`}>
              {title}
            </p>

            {/* body */}
            <p className="text-[13px] text-slate-600 dark:text-slate-400 leading-relaxed">
              {zh ? "金色财经报道，" : "Market update: "}{body}
            </p>
          </div>
        );
      })}
    </div>
  );
}
