import { useState, useEffect, useCallback } from "react";
import { CheckCircle, XCircle, RefreshCw, Search, ExternalLink, ChevronDown, ChevronUp, Trash2, ShieldOff } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

function getApiBase() {
  const base = import.meta.env.BASE_URL ?? "/";
  const parts = base.replace(/\/$/, "").split("/");
  parts.pop();
  return parts.join("/") + "/api";
}

type AppStatus = "pending" | "approved" | "rejected";

interface SpaceApp {
  id: number;
  wallet: string;
  type: string;
  twitter?: string | null;
  tweetLink?: string | null;
  projectName?: string | null;
  projectTwitter?: string | null;
  docsLink?: string | null;
  github?: string | null;
  linkedin?: string | null;
  status: AppStatus;
  createdAt: string;
  rejectReason?: string | null;
}

function StatusBadge({ status }: { status: AppStatus }) {
  if (status === "pending")
    return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">待审核</span>;
  if (status === "approved")
    return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">已通过</span>;
  return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">已拒绝</span>;
}

function TypeBadge({ type }: { type: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    project:   { label: "项目方", cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
    kol:       { label: "KOL",    cls: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" },
    developer: { label: "开发者", cls: "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400" },
  };
  const t = map[type] ?? { label: type, cls: "bg-muted text-muted-foreground" };
  return <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${t.cls}`}>{t.label}</span>;
}

export function ClaimsPanel({ adminWallet }: { adminWallet?: string }) {
  const { toast } = useToast();
  const apiBase = getApiBase();
  const [apps, setApps] = useState<SpaceApp[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"all" | AppStatus>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [rejectReasons, setRejectReasons] = useState<Record<number, string>>({});
  const [processing, setProcessing] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [confirmRevokeId, setConfirmRevokeId] = useState<number | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const url = `${apiBase}/admin/applications${adminWallet ? `?adminWallet=${adminWallet}` : ""}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setApps(data.applications ?? []);
    } catch (e) {
      toast({ title: `❌ 加载失败：${String(e)}`, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [apiBase, adminWallet, toast]);

  useEffect(() => { reload(); }, [reload]);

  const approve = useCallback(async (id: number) => {
    setProcessing(id);
    try {
      const url = `${apiBase}/admin/applications/${id}/approve${adminWallet ? `?adminWallet=${adminWallet}` : ""}`;
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" } });
      if (!res.ok) throw new Error(await res.text());
      toast({ title: "✅ 申请已通过，用户已升级为团队账号" });
      await reload();
    } catch (e) {
      toast({ title: `❌ 操作失败：${String(e)}`, variant: "destructive" });
    } finally {
      setProcessing(null);
    }
  }, [apiBase, adminWallet, toast, reload]);

  const reject = useCallback(async (id: number) => {
    setProcessing(id);
    try {
      const reason = rejectReasons[id] ?? "";
      const url = `${apiBase}/admin/applications/${id}/reject${adminWallet ? `?adminWallet=${adminWallet}` : ""}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      if (!res.ok) throw new Error(await res.text());
      toast({ title: "❌ 申请已拒绝" });
      await reload();
    } catch (e) {
      toast({ title: `❌ 操作失败：${String(e)}`, variant: "destructive" });
    } finally {
      setProcessing(null);
    }
  }, [apiBase, adminWallet, rejectReasons, toast, reload]);

  const deleteApp = useCallback(async (id: number) => {
    setProcessing(id);
    setConfirmDeleteId(null);
    try {
      const url = `${apiBase}/admin/applications/${id}${adminWallet ? `?adminWallet=${adminWallet}` : ""}`;
      const res = await fetch(url, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
      toast({ title: "🗑️ 申请已删除" });
      setExpandedId(null);
      await reload();
    } catch (e) {
      toast({ title: `❌ 删除失败：${String(e)}`, variant: "destructive" });
    } finally {
      setProcessing(null);
    }
  }, [apiBase, adminWallet, toast, reload]);

  const revokeUser = useCallback(async (app: SpaceApp) => {
    setProcessing(app.id);
    setConfirmRevokeId(null);
    try {
      const url = `${apiBase}/admin/users/${app.wallet}/revoke${adminWallet ? `?adminWallet=${adminWallet}` : ""}`;
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" } });
      if (!res.ok) throw new Error(await res.text());
      toast({ title: "🚫 身份已撤回，用户已降为普通用户" });
      await reload();
    } catch (e) {
      toast({ title: `❌ 撤回失败：${String(e)}`, variant: "destructive" });
    } finally {
      setProcessing(null);
    }
  }, [apiBase, adminWallet, toast, reload]);

  const pending  = apps.filter(a => a.status === "pending").length;
  const approved = apps.filter(a => a.status === "approved").length;
  const rejected = apps.filter(a => a.status === "rejected").length;

  const filtered = apps
    .filter(a => statusFilter === "all" || a.status === statusFilter)
    .filter(a => {
      if (!searchTerm) return true;
      const q = searchTerm.toLowerCase();
      return (
        (a.wallet ?? "").toLowerCase().includes(q) ||
        (a.projectName ?? "").toLowerCase().includes(q) ||
        (a.twitter ?? "").toLowerCase().includes(q) ||
        (a.type ?? "").toLowerCase().includes(q)
      );
    });

  return (
    <div className="space-y-5">
      {/* Stats */}
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <div className="flex gap-3">
          {[
            { label: "待审核", value: pending,  color: "text-amber-600",   s: "pending" as const },
            { label: "已通过", value: approved, color: "text-emerald-600", s: "approved" as const },
            { label: "已拒绝", value: rejected, color: "text-red-600",     s: "rejected" as const },
          ].map(({ label, value, color, s }) => (
            <button key={label} onClick={() => setStatusFilter(prev => prev === s ? "all" : s)}
              className={`rounded-2xl px-4 py-3 text-center border transition-all min-w-[80px] ${statusFilter === s ? "border-primary/50 shadow-sm" : "border-border"} bg-card hover:shadow-md`}>
              <div className={`text-xs font-medium ${color}`}>{label}</div>
              <div className="text-2xl font-bold text-foreground mt-0.5">{value}</div>
            </button>
          ))}
        </div>
        <button onClick={reload} disabled={loading}
          className="flex items-center gap-1.5 px-4 py-2 border border-border rounded-xl text-sm hover:bg-muted transition-colors disabled:opacity-60">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          {loading ? "加载中..." : "刷新"}
        </button>
      </div>

      {/* Search + filter */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
            placeholder="搜索钱包 / 项目名 / Twitter..."
            className="w-full pl-9 pr-4 py-2 border border-border rounded-xl text-sm bg-background focus:outline-none focus:border-primary/50" />
        </div>
        {(["all", "pending", "approved", "rejected"] as const).map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`px-3 py-2 rounded-xl text-xs font-medium transition-colors ${
              statusFilter === s ? "bg-primary text-primary-foreground" : "border border-border hover:bg-muted text-muted-foreground"
            }`}>
            {s === "all" ? "全部" : s === "pending" ? "待审核" : s === "approved" ? "已通过" : "已拒绝"}
          </button>
        ))}
      </div>

      {/* Empty */}
      {!loading && filtered.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <div className="text-5xl mb-3">📭</div>
          <p className="font-medium">{statusFilter === "all" ? "暂无申请记录" : "该状态下暂无申请"}</p>
          <p className="text-sm mt-1 text-muted-foreground/60">用户提交团队入驻申请后将在此显示</p>
        </div>
      )}

      {/* Application cards */}
      <div className="space-y-3">
        {filtered.map(app => {
          const isExpanded = expandedId === app.id;
          const name = app.projectName || app.twitter || app.wallet.slice(0, 10) + "...";
          return (
            <div key={app.id} className="bg-card border border-border rounded-2xl overflow-hidden hover:border-primary/30 transition-colors">
              {/* Header row */}
              <div className="flex items-center gap-3 px-5 py-4 cursor-pointer"
                onClick={() => setExpandedId(isExpanded ? null : app.id)}>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <TypeBadge type={app.type} />
                    <StatusBadge status={app.status} />
                    <span className="text-xs text-muted-foreground font-mono">{app.wallet.slice(0, 8)}...{app.wallet.slice(-4)}</span>
                  </div>
                  <p className="font-semibold text-sm text-foreground truncate">{name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    申请时间：{new Date(app.createdAt).toLocaleString("zh-CN")}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {app.status === "pending" && (
                    <>
                      <button onClick={e => { e.stopPropagation(); approve(app.id); }}
                        disabled={processing === app.id}
                        className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-medium hover:bg-emerald-700 transition-colors disabled:opacity-60">
                        <CheckCircle className="w-3 h-3" /> 通过
                      </button>
                      <button onClick={e => { e.stopPropagation(); reject(app.id); }}
                        disabled={processing === app.id}
                        className="flex items-center gap-1 px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs font-medium hover:bg-red-700 transition-colors disabled:opacity-60">
                        <XCircle className="w-3 h-3" /> 拒绝
                      </button>
                    </>
                  )}
                  {app.status === "approved" && (
                    <button onClick={e => { e.stopPropagation(); setConfirmRevokeId(app.id); setExpandedId(app.id); }}
                      disabled={processing === app.id}
                      className="flex items-center gap-1 px-3 py-1.5 bg-orange-500 text-white rounded-lg text-xs font-medium hover:bg-orange-600 transition-colors disabled:opacity-60">
                      <ShieldOff className="w-3 h-3" /> 撤回身份
                    </button>
                  )}
                  {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                </div>
              </div>

              {/* Expanded details */}
              {isExpanded && (
                <div className="border-t border-border px-5 py-4 space-y-3 bg-muted/20">
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    {[
                      { label: "钱包地址", val: app.wallet },
                      { label: "类型", val: app.type },
                      { label: "项目名称", val: app.projectName },
                      { label: "Twitter", val: app.twitter },
                      { label: "项目 Twitter", val: app.projectTwitter },
                      { label: "发推链接", val: app.tweetLink },
                      { label: "文档链接", val: app.docsLink },
                      { label: "GitHub", val: app.github },
                      { label: "LinkedIn", val: app.linkedin },
                      { label: "拒绝原因", val: app.rejectReason },
                    ].filter(({ val }) => val).map(({ label, val }) => (
                      <div key={label} className="col-span-1">
                        <span className="text-xs text-muted-foreground">{label}：</span>
                        {val!.startsWith("http") ? (
                          <a href={val!} target="_blank" rel="noreferrer"
                            className="text-xs text-primary hover:underline inline-flex items-center gap-0.5 break-all">
                            {val!.length > 40 ? val!.slice(0, 40) + "..." : val!}
                            <ExternalLink className="w-2.5 h-2.5 shrink-0" />
                          </a>
                        ) : (
                          <span className="text-xs text-foreground break-all">{val}</span>
                        )}
                      </div>
                    ))}
                  </div>

                  {app.status === "pending" && (
                    <div className="space-y-2 pt-1">
                      <label className="text-xs font-medium text-muted-foreground">拒绝备注（可选）</label>
                      <textarea
                        value={rejectReasons[app.id] ?? ""}
                        onChange={e => setRejectReasons(prev => ({ ...prev, [app.id]: e.target.value }))}
                        rows={2}
                        placeholder="填写拒绝原因，用户可见..."
                        className="w-full px-3 py-2 border border-border rounded-xl text-sm bg-background focus:outline-none focus:border-primary/50 resize-none"
                      />
                      <div className="flex gap-2">
                        <button onClick={() => approve(app.id)} disabled={processing === app.id}
                          className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-medium hover:bg-emerald-700 transition-colors disabled:opacity-60">
                          <CheckCircle className="w-3.5 h-3.5" /> 通过申请
                        </button>
                        <button onClick={() => reject(app.id)} disabled={processing === app.id}
                          className="flex items-center gap-1.5 px-4 py-2 bg-red-600 text-white rounded-xl text-sm font-medium hover:bg-red-700 transition-colors disabled:opacity-60">
                          <XCircle className="w-3.5 h-3.5" /> 拒绝申请
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Actions row: revoke (approved only) + delete */}
                  <div className="pt-2 border-t border-border/50 flex flex-wrap items-center gap-2">
                    {/* Revoke identity — only for approved */}
                    {app.status === "approved" && (
                      confirmRevokeId === app.id ? (
                        <>
                          <span className="text-xs text-orange-600 dark:text-orange-400 font-medium">确认撤回该用户身份？将降为普通用户。</span>
                          <button onClick={() => revokeUser(app)} disabled={processing === app.id}
                            className="px-3 py-1.5 bg-orange-500 text-white rounded-lg text-xs font-medium hover:bg-orange-600 transition-colors disabled:opacity-60">
                            确认撤回
                          </button>
                          <button onClick={() => setConfirmRevokeId(null)}
                            className="px-3 py-1.5 border border-border rounded-lg text-xs text-muted-foreground hover:bg-muted transition-colors">
                            取消
                          </button>
                        </>
                      ) : (
                        <button onClick={() => setConfirmRevokeId(app.id)} disabled={processing === app.id}
                          className="flex items-center gap-1.5 px-3 py-1.5 border border-orange-200 dark:border-orange-800 text-orange-600 dark:text-orange-400 rounded-lg text-xs font-medium hover:bg-orange-50 dark:hover:bg-orange-950/30 transition-colors disabled:opacity-60">
                          <ShieldOff className="w-3 h-3" /> 撤回身份
                        </button>
                      )
                    )}
                    {/* Delete */}
                    {confirmDeleteId === app.id ? (
                      <>
                        <span className="text-xs text-red-600 dark:text-red-400 font-medium">确认删除此申请记录？</span>
                        <button onClick={() => deleteApp(app.id)} disabled={processing === app.id}
                          className="px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs font-medium hover:bg-red-700 transition-colors disabled:opacity-60">
                          确认删除
                        </button>
                        <button onClick={() => setConfirmDeleteId(null)}
                          className="px-3 py-1.5 border border-border rounded-lg text-xs text-muted-foreground hover:bg-muted transition-colors">
                          取消
                        </button>
                      </>
                    ) : (
                      <button onClick={() => setConfirmDeleteId(app.id)} disabled={processing === app.id}
                        className="flex items-center gap-1.5 px-3 py-1.5 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 rounded-lg text-xs font-medium hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors disabled:opacity-60">
                        <Trash2 className="w-3 h-3" /> 删除申请
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
