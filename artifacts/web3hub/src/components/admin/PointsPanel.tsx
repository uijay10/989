import { useState, useCallback } from "react";
import { Search, Plus, Minus, RotateCcw, Coins, Trophy, Loader2, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

function getApiBase() {
  const base = import.meta.env.BASE_URL ?? "/";
  const parts = base.replace(/\/$/, "").split("/");
  parts.pop();
  return parts.join("/") + "/api";
}

interface UserInfo {
  wallet: string;
  username?: string | null;
  tokens: number;
  points: number;
  spaceType?: string | null;
}

type Field = "tokens" | "points";

const FIELD_CONFIG: Record<Field, { label: string; icon: React.ReactNode; color: string }> = {
  tokens: { label: "$WBR Token",  icon: <Coins className="w-4 h-4" />,  color: "text-amber-500" },
  points: { label: "积分 Points", icon: <Trophy className="w-4 h-4" />, color: "text-blue-500" },
};

export function PointsPanel({ adminWallet }: { adminWallet?: string }) {
  const { toast } = useToast();
  const apiBase = getApiBase();

  const [searchWallet, setSearchWallet] = useState("");
  const [user, setUser] = useState<UserInfo | null>(null);
  const [searching, setSearching] = useState(false);

  const [field, setField] = useState<Field>("tokens");
  const [op, setOp] = useState<"add" | "sub" | "set">("add");
  const [value, setValue] = useState("");
  const [processing, setProcessing] = useState(false);

  const lookupUser = useCallback(async () => {
    const w = searchWallet.trim().toLowerCase();
    if (!w) return;
    setSearching(true);
    setUser(null);
    try {
      const url = `${apiBase}/admin/users?adminWallet=${adminWallet ?? ""}&limit=200`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      const found = (data.users ?? []).find((u: UserInfo) =>
        u.wallet.toLowerCase() === w ||
        (u.username ?? "").toLowerCase().includes(w)
      );
      if (!found) {
        toast({ title: "未找到该用户，请检查钱包地址" });
      } else {
        setUser(found);
      }
    } catch (e) {
      toast({ title: `查询失败：${String(e)}`, variant: "destructive" });
    } finally {
      setSearching(false);
    }
  }, [searchWallet, apiBase, adminWallet, toast]);

  const adjust = useCallback(async () => {
    if (!user) return;
    const num = Number(value);
    if (op !== "set" && (isNaN(num) || num <= 0)) {
      toast({ title: "请输入有效的正整数", variant: "destructive" });
      return;
    }
    if (op === "set" && (isNaN(num) || num < 0)) {
      toast({ title: "请输入 ≥ 0 的数值", variant: "destructive" });
      return;
    }
    setProcessing(true);
    try {
      const url = `${apiBase}/admin/users/${user.wallet}/${field}${adminWallet ? `?adminWallet=${adminWallet}` : ""}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op, value: num }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      const newVal: number = data[field] ?? 0;
      setUser(prev => prev ? { ...prev, [field]: newVal } : prev);
      const opLabel = op === "add" ? "增加" : op === "sub" ? "减少" : "设置为";
      toast({ title: `✅ ${user.username || user.wallet.slice(0, 8)} ${FIELD_CONFIG[field].label} 已${opLabel} ${op === "set" ? num : num}，当前：${newVal.toLocaleString()}` });
      setValue("");
    } catch (e) {
      toast({ title: `操作失败：${String(e)}`, variant: "destructive" });
    } finally {
      setProcessing(false);
    }
  }, [user, field, op, value, apiBase, adminWallet, toast]);

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        输入用户钱包地址（或用户名前缀），查询后可对其积分、Token 和能量进行加减操作。
      </p>

      {/* Search */}
      <div className="space-y-2">
        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">查找用户</label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              value={searchWallet}
              onChange={e => setSearchWallet(e.target.value)}
              onKeyDown={e => e.key === "Enter" && lookupUser()}
              placeholder="0x... 钱包地址 或 用户名"
              className="w-full pl-9 pr-4 py-2.5 border border-border rounded-xl text-sm bg-background focus:outline-none focus:border-primary/50 font-mono"
            />
          </div>
          <button onClick={lookupUser} disabled={searching || !searchWallet.trim()}
            className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50">
            {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            查询
          </button>
        </div>
      </div>

      {/* User card */}
      {user && (
        <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
          {/* User info */}
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <p className="font-semibold text-sm">{user.username || "未命名用户"}</p>
                {user.spaceType && (
                  <span className="px-2 py-0.5 rounded-full text-xs bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                    {user.spaceType}
                  </span>
                )}
              </div>
              <p className="text-xs font-mono text-muted-foreground mt-0.5 break-all">{user.wallet}</p>
            </div>
            <button onClick={() => { setUser(null); setSearchWallet(""); setValue(""); }}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors shrink-0">
              清除
            </button>
          </div>

          {/* Balance summary */}
          <div className="grid grid-cols-2 gap-3">
            {(["tokens", "points"] as Field[]).map(f => (
              <div key={f} className={`rounded-xl p-3 border transition-all cursor-pointer ${field === f ? "border-primary/50 bg-primary/5" : "border-border hover:border-primary/30"}`}
                onClick={() => setField(f)}>
                <div className={`flex items-center gap-1.5 mb-1 ${FIELD_CONFIG[f].color}`}>
                  {FIELD_CONFIG[f].icon}
                  <span className="text-xs font-medium">{FIELD_CONFIG[f].label}</span>
                </div>
                <p className="text-xl font-bold text-foreground">
                  {(user[f] ?? 0).toLocaleString()}
                </p>
                {field === f && <p className="text-[10px] text-primary mt-0.5">当前编辑</p>}
              </div>
            ))}
          </div>

          {/* Operation */}
          <div className="space-y-3 pt-1 border-t border-border">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-muted-foreground">调整</span>
              <span className={`font-semibold text-sm ${FIELD_CONFIG[field].color}`}>{FIELD_CONFIG[field].label}</span>
            </div>

            {/* Op type buttons */}
            <div className="flex gap-2">
              {(["add", "sub", "set"] as const).map(o => (
                <button key={o} onClick={() => setOp(o)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    op === o ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-primary hover:text-foreground"
                  }`}>
                  {o === "add" ? <><Plus className="w-3 h-3" /> 增加</> : o === "sub" ? <><Minus className="w-3 h-3" /> 减少</> : <><RotateCcw className="w-3 h-3" /> 直接设置</>}
                </button>
              ))}
            </div>

            {/* Value input + confirm */}
            <div className="flex gap-2">
              <input
                type="number"
                min="0"
                value={value}
                onChange={e => setValue(e.target.value)}
                onKeyDown={e => e.key === "Enter" && adjust()}
                placeholder={op === "set" ? "设置为..." : "输入数量..."}
                className="flex-1 px-4 py-2.5 border border-border rounded-xl text-sm bg-background focus:outline-none focus:border-primary/50"
              />
              <button onClick={adjust} disabled={processing || !value}
                className={`flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 ${
                  op === "add" ? "bg-emerald-600 hover:bg-emerald-700 text-white" :
                  op === "sub" ? "bg-red-600 hover:bg-red-700 text-white" :
                  "bg-blue-600 hover:bg-blue-700 text-white"
                }`}>
                {processing
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : op === "add" ? <><Plus className="w-4 h-4" /> 增加</> : op === "sub" ? <><Minus className="w-4 h-4" /> 减少</> : <><Check className="w-4 h-4" /> 设置</>
                }
              </button>
            </div>

            {/* Preview */}
            {value && !isNaN(Number(value)) && Number(value) >= 0 && (
              <p className="text-xs text-muted-foreground px-1">
                操作后预计值：<span className={`font-semibold ${FIELD_CONFIG[field].color}`}>
                  {op === "add"
                    ? ((user[field] ?? 0) + Number(value)).toLocaleString()
                    : op === "sub"
                    ? Math.max(0, (user[field] ?? 0) - Number(value)).toLocaleString()
                    : Number(value).toLocaleString()
                  }
                </span>
              </p>
            )}
          </div>
        </div>
      )}

      {/* Empty hint */}
      {!user && !searching && (
        <div className="text-center py-12 text-muted-foreground border border-dashed border-border rounded-2xl">
          <Coins className="w-10 h-10 mx-auto mb-3 opacity-20" />
          <p className="text-sm font-medium">输入钱包地址后查询用户</p>
          <p className="text-xs mt-1 opacity-60">支持完整钱包地址 / 用户名前缀搜索</p>
        </div>
      )}
    </div>
  );
}
