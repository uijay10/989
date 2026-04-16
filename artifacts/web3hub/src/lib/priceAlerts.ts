export interface PriceAlertMsg {
  id: number;
  symbol: string;
  kind: "pct" | "level_up" | "level_down";
  change1m?: number;
  change24h?: number;
  level?: number;
  price: number;
  ts: number;
}

let _alerts: PriceAlertMsg[] = [];
const _listeners = new Set<() => void>();
let _seq = 0;

export function pushPriceAlert(a: Omit<PriceAlertMsg, "id">) {
  _seq++;
  _alerts = [{ id: _seq, ...a }, ..._alerts.slice(0, 19)];
  _listeners.forEach(fn => fn());
}

export function subscribePriceAlerts(fn: () => void): () => void {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}

export function getPriceAlerts(): PriceAlertMsg[] {
  return _alerts;
}
