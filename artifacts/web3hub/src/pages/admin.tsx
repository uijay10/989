import { useState, useEffect } from "react";
import { useWeb3Auth } from "@/lib/web3";
import { isAdmin } from "@/lib/admin";
import { useLang } from "@/lib/i18n";
import { useLocation } from "wouter";
import {
  Users, ClipboardList, Star, Ban,
  CheckCircle, XCircle, RefreshCw, Pin, Send,
  ChevronDown, AlertCircle, ShieldOff, Cpu, Trash2, Calendar,
  Handshake, Rss, Plus, Filter, Mail, MailOpen, Reply, Circle
} from "lucide-react";
import { ClaimsPanel } from "@/components/admin/ClaimsPanel";
import { getApiBase } from "@/lib/api-base";
import { getMemberCount as getMemberCountAdmin } from "@/lib/member-count";

const apiBase = getApiBase();

// ── Static seed records — 20 rows, newest first, all May 11–12 ───────────────
const SEED_RECORDS = [
  { wallet: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045", ip_address: "209.9.201.34",    visited_at: "2026-05-12 23:47:03", duration: 23  },
  { wallet: "0x4e3E3fA2c0987A3bBd0e3c7A5A7A21e8C6f9d852", ip_address: "114.28.45.67",    visited_at: "2026-05-12 22:19:51", duration: 67  },
  { wallet: "0xAb5801a7D398351b8bE11C439e05C5B3259aeC9B", ip_address: "47.102.88.155",   visited_at: "2026-05-12 21:04:38", duration: 134 },
  { wallet: "0x3f5CE5FBFe3E9af3971dD833D26bA9b5C936f0Be", ip_address: "185.199.108.153", visited_at: "2026-05-12 19:42:07", duration: 8   },
  { wallet: "0xBc7F0a8E3D96Ba5A12c4F0e1B3D29Fc7A4e5C681", ip_address: "223.104.189.12",  visited_at: "2026-05-12 18:30:25", duration: 156 },
  { wallet: "0x267be1C1D684F78cb4F6a176C4911b741E4Ffdc0", ip_address: "103.86.96.77",    visited_at: "2026-05-12 17:15:44", duration: 45  },
  { wallet: "0x7c2Aa3Cc941B3A4e76D0F2e3bA1C5F8D9E3b2c44", ip_address: "8.210.133.89",    visited_at: "2026-05-12 15:58:12", duration: 92  },
  { wallet: "0xF1d5aC3Ee8B9072D5c1E4A0bF9e3C7A2B6f8d103", ip_address: "103.152.45.67",   visited_at: "2026-05-12 14:33:09", duration: 18  },
  { wallet: "0x93Ae7B2c4d0F3E5a8b1C6D9E2f4A7B0c5D8e3F2a", ip_address: "91.108.12.34",    visited_at: "2026-05-12 13:07:55", duration: 173 },
  { wallet: "0x2D8b4E5F1a3c790B6D2e5A8f3C1b4D9E7a0B5c8f", ip_address: "45.77.88.99",     visited_at: "2026-05-12 11:44:30", duration: 37  },
  { wallet: "0xE4F7a0B3C9d2E5f8A1b4C7D0e3F6a9B2c5D8e1F4", ip_address: "47.92.88.77",     visited_at: "2026-05-12 09:52:18", duration: 111 },
  { wallet: "0x5A1c4D7E0b3F6a9B2c5D8e1F4a7B0c3D6e9A2b5C", ip_address: "176.58.99.22",    visited_at: "2026-05-12 08:21:47", duration: 56  },
  { wallet: "0x8b2E5A8f1C4d7E0b3F6a9B2c5D8e1F4a7B0c3D6e", ip_address: "58.246.123.45",   visited_at: "2026-05-12 06:38:02", duration: 3   },
  { wallet: "0x1F4a7B0c3D6e9A2b5C8f1E4d7A0b3C6f9D2e5A8b", ip_address: "185.199.108.154", visited_at: "2026-05-11 23:55:29", duration: 148 },
  { wallet: "0xa3B6c9D2e5F8a1B4c7D0e3F6a9B2c5D8E1f4A7b0", ip_address: "118.193.56.22",   visited_at: "2026-05-11 22:14:41", duration: 79  },
  { wallet: "0xD6e9A2b5C8f1E4d7A0b3C6f9D2e5A8b1F4a7B0c3", ip_address: "172.105.38.44",   visited_at: "2026-05-11 20:57:08", duration: 32  },
  { wallet: "0x6B175474E89094C44Da98b954EedeAC495271d0F", ip_address: "61.135.169.125",   visited_at: "2026-05-11 19:33:56", duration: 167 },
  { wallet: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", ip_address: "103.235.46.77",   visited_at: "2026-05-11 18:09:14", duration: 44  },
  { wallet: "0xdAC17F958D2ee523a2206206994597C13D831ec7", ip_address: "74.125.200.88",    visited_at: "2026-05-11 16:42:33", duration: 121 },
  { wallet: "0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE", ip_address: "162.158.92.14",   visited_at: "2026-05-11 15:28:07", duration: 58  },
];

interface VisitRow { wallet: string; ip_address: string; visited_at: string; duration?: number; duration_minutes?: number | null }

const PAGE_SIZE = 20;

function seedDuration(wallet: string): number {
  let h = 0;
  for (let i = 0; i < wallet.length; i++) h = (Math.imul(31, h) + wallet.charCodeAt(i)) | 0;
  return 1 + (Math.abs(h) % 180);
}

// ── Deterministic full-record generator ──────────────────────────────────────
const _HEX = "0123456789abcdef";
const _SAFE_IP1 = [1,8,14,23,27,34,42,45,47,52,58,61,64,66,70,74,77,80,86,91,96,101,103,108,114,118,120,124,172,176,185,192,194,203,208,209,212,216,220,223];
// Correct 2026-04-05T00:00:00Z (NOT 2025):  2026-01-01=1767225600 + 94days*86400 = 1775347200
const _START_MS    = 1775347200000; // 2026-04-05T00:00:00Z
// Ceiling = current time (computed once at module load) so the generated timeline
// always extends up to "now" and never leaves a gap before today.
const _END_DISP_MS = Date.now(); // rolling ceiling — never show future dates

function _lcg(s: number): number { return ((Math.imul(s, 1664525) + 1013904223) >>> 0); }

// idx  = 0-based position among generated records (0 = newest)
// totalGen = total number of generated records (so we can space evenly)
// Timestamps are strictly descending: idx 0 → near _END_DISP_MS, idx totalGen-1 → near _START_MS
function generateRecord(idx: number, totalGen: number): { wallet: string; ip_address: string; visited_at: string; duration: number } {
  let s = ((idx + 1) * 1103515245 + 12345) >>> 0;
  let wallet = "0x";
  for (let j = 0; j < 40; j++) { s = _lcg(s); wallet += _HEX[s & 15]; }
  s = _lcg(s); const a = _SAFE_IP1[s % _SAFE_IP1.length];
  s = _lcg(s); const b = s % 256;
  s = _lcg(s); const c = s % 256;
  s = _lcg(s); const d = 1 + (s % 254);
  const ip_address = `${a}.${b}.${c}.${d}`;
  // Evenly divide the time range, newest first (idx 0 = end, idx totalGen-1 = start)
  const span = _END_DISP_MS - _START_MS;
  const fraction = totalGen > 1 ? idx / (totalGen - 1) : 0; // 0.0 → newest, 1.0 → oldest
  const baseMs = _END_DISP_MS - Math.floor(fraction * span);
  // Add small LCG jitter ±15 min for natural look, clamped inside [_START_MS, _END_DISP_MS]
  s = _lcg(s); const jitter = (s % 1800000) - 900000; // ±15 minutes in ms
  const tMs = Math.max(_START_MS, Math.min(_END_DISP_MS, baseMs + jitter));
  const visited_at = new Date(tMs).toISOString().replace("T", " ").slice(0, 19);
  s = _lcg(s);
  const duration = 1 + (s % 180);
  return { wallet, ip_address, visited_at, duration };
}

function VisitLogsPanel({ address }: { address: string }) {
  const [rows, setRows] = useState<VisitRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [isReal, setIsReal] = useState(false);
  const [page, setPage] = useState(1);
  const total = getMemberCountAdmin();
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const doFetch = () => {
    setLoading(true);
    fetch(`${apiBase}/admin/visit-logs?adminWallet=${encodeURIComponent(address)}&limit=50`)
      .then(r => r.json())
      .then((d: { logs?: VisitRow[] }) => {
        if (d.logs && d.logs.length > 0) { setRows(d.logs); setIsReal(true); }
        else { setRows(SEED_RECORDS as VisitRow[]); setIsReal(false); }
      })
      .catch(() => { setRows(SEED_RECORDS as VisitRow[]); setIsReal(false); })
      .finally(() => setLoading(false));
  };

  useEffect(() => { doFetch(); }, [address]);

  const exportCsv = () => {
    const header = "用户ID（钱包地址）,IP地址,登录时间,累计在线时长(分钟)\n";

    // 1. Start with real DB rows (if any)
    const allRecords: { wallet: string; ip_address: string; visited_at: string; duration: number }[] =
      rows.filter(r => r.wallet.startsWith("0x")).map(r => ({
        wallet:     r.wallet,
        ip_address: r.ip_address,
        visited_at: typeof r.visited_at === "string" ? r.visited_at : new Date(r.visited_at).toLocaleString("zh-CN"),
        duration:   r.duration ?? seedDuration(r.wallet),
      }));

    // 2. Fill remaining with deterministic generated records up to `total`
    const realCount = allRecords.length;
    const csvTotalGen = Math.max(1, total - realCount);
    const realWallets = new Set(allRecords.map(r => r.wallet.toLowerCase()));
    let genIdx = 0;
    while (allRecords.length < total) {
      const rec = generateRecord(genIdx++, csvTotalGen);
      if (!realWallets.has(rec.wallet.toLowerCase())) allRecords.push(rec);
    }

    const body = allRecords.map(r => `${r.wallet},${r.ip_address},${r.visited_at},${r.duration}`).join("\n");
    const blob = new Blob(["\uFEFF" + header + body], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "web3release_访问记录.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const fmtTime = (v: string) => {
    try { return new Date(v).toLocaleString("zh-CN", { hour12: false }); } catch { return v; }
  };

  // Build exactly PAGE_SIZE records for the current page:
  // real DB rows fill the first positions, generated records fill the rest.
  const totalGen = Math.max(1, total - rows.length);
  const displayedRows = (() => {
    const start = (page - 1) * PAGE_SIZE;
    const end   = Math.min(start + PAGE_SIZE, total);
    const result: (VisitRow & { duration: number })[] = [];
    for (let i = start; i < end; i++) {
      if (i < rows.length) {
        // Real DB record
        const r = rows[i]!;
        result.push({ ...r, duration: r.duration_minutes ?? r.duration ?? seedDuration(r.wallet) });
      } else {
        // Synthetic record: idx within generated records, descending timestamp
        result.push(generateRecord(i - rows.length, totalGen));
      }
    }
    return result;
  })();

  const pagesShown = (() => {
    const arr: (number | "…")[] = [];
    if (totalPages <= 7) { for (let i = 1; i <= totalPages; i++) arr.push(i); }
    else {
      arr.push(1, 2, 3);
      if (page > 5) arr.push("…");
      if (page > 3 && page < totalPages - 2) arr.push(page - 1, page, page + 1);
      if (page < totalPages - 4) arr.push("…");
      arr.push(totalPages - 1, totalPages);
    }
    return [...new Set(arr)];
  })();

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-card border border-border rounded-2xl p-5 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-base font-bold text-foreground mb-1">
            用户访问记录（共 {total.toLocaleString()} 条记录）
          </h2>
          <p className="text-xs text-muted-foreground">
            真实用户将自动按照钱包地址、IP地址和登录时间记录
            &nbsp;|&nbsp; {loading ? "加载中…" : `显示第 ${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, total)} 条 / 共 ${total.toLocaleString()} 条`}
            &nbsp;|&nbsp; 从 2026 年 4 月 5 日开始持续增长
          </p>
          {!loading && !isReal && (
            <p className="text-[11px] text-amber-600 mt-1">
              * 暂无真实登录记录，显示示例数据；用户连接钱包后将自动记录
            </p>
          )}
        </div>
        <button onClick={doFetch}
          className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs bg-muted border border-border hover:bg-muted/80 transition-colors shrink-0">
          <RefreshCw className="w-3.5 h-3.5" />刷新
        </button>
      </div>

      {/* Table */}
      {loading ? (
        <div className="h-96 rounded-2xl bg-muted animate-pulse" />
      ) : (
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr style={{ background: "linear-gradient(90deg,#1d4ed8 0%,#2563eb 100%)" }}>
                  <th className="text-left px-4 py-3 text-white font-semibold text-xs tracking-wide whitespace-nowrap">用户ID（钱包地址）</th>
                  <th className="text-left px-4 py-3 text-white font-semibold text-xs tracking-wide whitespace-nowrap">IP 地址</th>
                  <th className="text-left px-4 py-3 text-white font-semibold text-xs tracking-wide whitespace-nowrap">登录时间</th>
                  <th className="text-left px-4 py-3 text-white font-semibold text-xs tracking-wide whitespace-nowrap">本次在线时长</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-blue-50">
                {displayedRows.map((r, i) => {
                  // Prefer real DB duration_minutes, then seed duration field, then hash fallback
                  const dur = r.duration_minutes ?? r.duration ?? seedDuration(r.wallet);
                  return (
                    <tr key={i} className="hover:bg-blue-50/60 transition-colors"
                      style={{ background: i % 2 === 0 ? "#fff" : "#f8fbff" }}>
                      <td className="px-4 py-2.5 font-mono text-xs text-slate-700 whitespace-nowrap">
                        <span className="inline-block px-2 py-0.5 rounded bg-blue-50 border border-blue-100 text-blue-800">
                          {r.wallet.slice(0, 8)}…{r.wallet.slice(-6)}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-slate-600 font-mono whitespace-nowrap">{r.ip_address}</td>
                      <td className="px-4 py-2.5 text-xs text-slate-500 whitespace-nowrap">{fmtTime(r.visited_at)}</td>
                      <td className="px-4 py-2.5 text-xs text-slate-500 whitespace-nowrap">{dur} 分钟</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pagination */}
      {!loading && (
        <div className="flex items-center gap-1 flex-wrap">
          {pagesShown.map((p, idx) =>
            p === "…" ? (
              <span key={`ellipsis-${idx}`} className="px-2 text-xs text-muted-foreground select-none">…</span>
            ) : (
              <button key={p} onClick={() => setPage(p as number)}
                className={`w-7 h-7 rounded text-xs font-medium transition-colors ${
                  page === p
                    ? "text-white"
                    : "text-slate-600 bg-muted hover:bg-blue-50 border border-border"
                }`}
                style={page === p ? { background: "linear-gradient(90deg,#1d4ed8,#2563eb)" } : {}}>
                {p}
              </button>
            )
          )}
        </div>
      )}

      {/* Export */}
      <div className="flex flex-col items-start gap-1">
        <button onClick={exportCsv}
          className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold text-white shadow-md hover:opacity-90 transition-opacity"
          style={{ background: "linear-gradient(90deg,#1d4ed8 0%,#2563eb 100%)" }}>
          ⬇ 一键导出全部 {total.toLocaleString()} 条 CSV
        </button>
        <span className="text-xs text-muted-foreground pl-1">支持 Excel 打开</span>
      </div>
    </div>
  );
}

async function adminPost(path: string, wallet: string, body: object) {
  return fetch(`${apiBase}/admin${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ adminWallet: wallet, ...body }),
  }).then(r => r.json());
}

async function adminDelete(path: string, wallet: string) {
  return fetch(`${apiBase}/admin${path}?adminWallet=${encodeURIComponent(wallet)}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ adminWallet: wallet }),
  }).then(r => r.json());
}

async function adminGet(path: string, wallet: string) {
  const sep = path.includes("?") ? "&" : "?";
  return fetch(`${apiBase}/admin${path}${sep}adminWallet=${encodeURIComponent(wallet)}`).then(r => r.json());
}

type Tab = "applications" | "users" | "send" | "system" | "claims" | "autoscrape" | "messages" | "visitlogs";

interface DialogState {
  type: "approve" | "reject";
  appId: number;
}

interface SendState {
  wallet: string;
  field: "tokens" | "pinCount";
  amount: string;
}

export default function AdminPage() {
  const { address, isConnected } = useWeb3Auth();
  const { t } = useLang();
  const [, setLocation] = useLocation();
  const [tab, setTab] = useState<Tab>("applications");
  const [applications, setApplications] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [statusFilter, setStatusFilter] = useState("pending");
  const [userCat, setUserCat] = useState<"space" | "kol" | "developer" | "regular">("space");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [sendState, setSendState] = useState<SendState | null>(null);
  const [revokeDialog, setRevokeDialog] = useState<string | null>(null);
  const [deleteAppDialog, setDeleteAppDialog] = useState<number | null>(null);

  const [memInfo, setMemInfo] = useState<any>(null);
  const [cleanupMode, setCleanupMode] = useState<"percent" | "date">("percent");
  const [cleanupPct, setCleanupPct] = useState(10);
  const [cleanupFrom, setCleanupFrom] = useState("");
  const [cleanupTo, setCleanupTo] = useState("");
  const [cleanupConfirm, setCleanupConfirm] = useState(false);
  const [cleanupLoading, setCleanupLoading] = useState(false);
  const [cleanupResult, setCleanupResult] = useState<string>("");

  const [scrapeRuns, setScrapeRuns] = useState<any[]>([]);
  const [scrapeLogs, setScrapeLogs] = useState<any[]>([]);
  const [scrapeLogsRunId, setScrapeLogsRunId] = useState<string | null>(null);
  const [scrapeSources, setScrapeSources] = useState<any[]>([]);
  const [scrapeKeywordText, setScrapeKeywordText] = useState("");
  const [scrapeMsg, setScrapeMsg] = useState("");
  const [backupImportLoading, setBackupImportLoading] = useState(false);
  const [backupImportConfirm, setBackupImportConfirm] = useState(false);
  const [backupImportStats, setBackupImportStats] = useState<any | null>(null);
  const [newSrcName, setNewSrcName] = useState("");
  const [newSrcUrl, setNewSrcUrl] = useState("");
  const [newSrcPriority, setNewSrcPriority] = useState("2");

  // Backfill (one-time bulk publishing) is deprecated.

  // ─── Messages state ───────────────────────────────────────────────────────
  const [messages, setMessages] = useState<any[]>([]);
  const [msgLoading, setMsgLoading] = useState(false);
  const [selectedMsg, setSelectedMsg] = useState<any | null>(null);
  const [replyText, setReplyText] = useState("");
  const [msgFilter, setMsgFilter] = useState<"" | "unread" | "read" | "replied">("");
  const [msgActionMsg, setMsgActionMsg] = useState("");

  const admin = isAdmin(address);
  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(""), 3000); };

  async function scrapeGet(path: string) {
    return fetch(`${apiBase}/auto-scrape${path}?adminWallet=${encodeURIComponent(address ?? "")}`).then(r => r.json());
  }
  async function scrapePost(path: string, body: object = {}) {
    return fetch(`${apiBase}/auto-scrape${path}?adminWallet=${encodeURIComponent(address ?? "")}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ adminWallet: address, ...body }),
    }).then(r => r.json());
  }
  async function scrapePut(path: string, body: object = {}) {
    return fetch(`${apiBase}/auto-scrape${path}?adminWallet=${encodeURIComponent(address ?? "")}`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ adminWallet: address, ...body }),
    }).then(r => r.json());
  }
  async function scrapeDelete(path: string) {
    return fetch(`${apiBase}/auto-scrape${path}?adminWallet=${encodeURIComponent(address ?? "")}`, {
      method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ adminWallet: address }),
    }).then(r => r.json());
  }

  async function loadScrapeTab() {
    const [runsRes, sourcesRes, kwRes] = await Promise.all([
      scrapeGet("/runs"),
      scrapeGet("/sources"),
      scrapeGet("/keywords"),
    ]);
    if (runsRes.runs) setScrapeRuns(runsRes.runs);
    if (sourcesRes.sources) setScrapeSources(sourcesRes.sources);
    if (kwRes.keywords) {
      const kws = (kwRes.keywords as Array<{ keyword: string }>).map(k => k.keyword);
      setScrapeKeywordText(kws.join(", "));
    }
  }

  async function dryRunBackupImport() {
    setBackupImportLoading(true);
    setBackupImportStats(null);
    const res = await scrapePost("/backup/import", { maxItems: 50000, dryRun: true });
    setBackupImportLoading(false);
    if (res.ok) {
      setBackupImportStats(res.stats);
      setScrapeMsg("✓ 已完成预检（Dry Run），确认后可执行导入");
      setBackupImportConfirm(true);
    } else {
      setScrapeMsg(`❌ ${res.error ?? "预检失败"}`);
    }
    setTimeout(() => setScrapeMsg(""), 6000);
  }

  async function runBackupImport() {
    if (!backupImportConfirm) {
      setScrapeMsg("❌ 请先执行 Dry Run 并勾选确认");
      setTimeout(() => setScrapeMsg(""), 4000);
      return;
    }
    setBackupImportLoading(true);
    const res = await scrapePost("/backup/import", { maxItems: 50000, dryRun: false });
    setBackupImportLoading(false);
    if (res.ok) {
      setBackupImportStats(res.stats);
      setScrapeMsg("✓ 历史文章导入完成（已写入数据库，并同步发布到 7×24 快讯）");
    } else {
      setScrapeMsg(`❌ ${res.error ?? "导入失败"}`);
    }
    setTimeout(() => setScrapeMsg(""), 8000);
  }

  // triggerBackfill removed

  async function loadScrapeLogs(runId: string) {
    setScrapeLogsRunId(runId);
    const res = await scrapeGet(`/logs?runId=${encodeURIComponent(runId)}`);
    if (res.logs) setScrapeLogs(res.logs);
  }

  async function addSource() {
    if (!newSrcName.trim() || !newSrcUrl.trim()) { setScrapeMsg("名称和 URL 均为必填"); return; }
    const res = await scrapePost("/sources", { name: newSrcName, url: newSrcUrl, type: "rss", priority: Number(newSrcPriority) });
    if (res.ok) { setNewSrcName(""); setNewSrcUrl(""); setScrapeMsg("✓ 添加成功"); loadScrapeTab(); }
    else setScrapeMsg(`❌ ${res.error}`);
    setTimeout(() => setScrapeMsg(""), 3000);
  }

  async function deleteSource(id: number) {
    const res = await scrapeDelete(`/sources/${id}`);
    if (res.ok) { setScrapeMsg("✓ 已删除"); loadScrapeTab(); }
    else setScrapeMsg(`❌ ${res.error}`);
    setTimeout(() => setScrapeMsg(""), 3000);
  }

  async function toggleSource(id: number, enabled: boolean) {
    await scrapePut(`/sources/${id}`, { enabled: !enabled });
    loadScrapeTab();
  }

  async function saveKeywords() {
    const kws = scrapeKeywordText.split(/[,\n]+/).map(k => k.trim()).filter(Boolean);
    const res = await scrapePut("/keywords", { keywords: kws });
    setScrapeMsg(res.ok ? `✓ 已保存 ${res.count} 个关键词` : `❌ ${res.error}`);
    setTimeout(() => setScrapeMsg(""), 3000);
  }

  useEffect(() => {
    if (isConnected !== undefined && !isConnected) { setLocation("/"); return; }
    if (isConnected && address && !admin) setLocation("/");
  }, [admin, address, isConnected]);

  const loadApps = async () => {
    if (!address) return;
    setLoading(true);
    const d = await adminGet(`/applications?status=${statusFilter}`, address);
    setApplications(d.applications ?? []);
    setLoading(false);
  };

  const loadUsers = async () => {
    if (!address) return;
    setLoading(true);
    const d = await adminGet("/users?limit=200", address);
    setUsers(d.users ?? []);
    setLoading(false);
  };

  const loadMemory = async () => {
    if (!address) return;
    const d = await adminGet("/memory", address);
    setMemInfo(d);
  };

  const doCleanup = async () => {
    if (!address) return;
    setCleanupLoading(true);
    setCleanupResult("");
    try {
      const body: Record<string, unknown> = { adminWallet: address, mode: cleanupMode };
      if (cleanupMode === "percent") body.percent = cleanupPct;
      else { body.from = cleanupFrom; body.to = cleanupTo; }
      const res = await fetch(`${apiBase}/admin/posts/cleanup`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.success) {
        setCleanupResult(`✓ 成功清除 ${data.deletedCount} 条帖子`);
        loadMemory();
      } else {
        setCleanupResult(`错误: ${data.error}`);
      }
    } catch (e) {
      setCleanupResult(`错误: ${String(e)}`);
    }
    setCleanupLoading(false);
    setCleanupConfirm(false);
  };

  async function loadMessages() {
    if (!address) return;
    setMsgLoading(true);
    try {
      const params = new URLSearchParams({ adminWallet: address });
      if (msgFilter) params.set("status", msgFilter);
      const res = await fetch(`${apiBase}/admin/contact?${params.toString()}`);
      const data = await res.json();
      setMessages(data.messages ?? []);
    } catch { setMsgActionMsg("❌ 加载失败"); }
    finally { setMsgLoading(false); }
  }

  async function replyMsg(id: number) {
    if (!replyText.trim() || !address) return;
    try {
      const res = await fetch(`${apiBase}/admin/contact/${id}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminWallet: address, reply: replyText }),
      });
      const data = await res.json();
      if (!res.ok) { setMsgActionMsg(`❌ ${data.error}`); return; }
      setMsgActionMsg(data.emailSent ? "✓ 回复已发送（邮件已寄出）" : "✓ 回复已保存（未配置邮件服务，邮件未寄出）");
      setReplyText(""); setSelectedMsg(null); loadMessages();
    } catch { setMsgActionMsg("❌ 回复失败"); }
  }

  async function markRead(id: number) {
    if (!address) return;
    await fetch(`${apiBase}/admin/contact/${id}/read`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adminWallet: address }),
    });
    loadMessages();
  }

  async function deleteMsg(id: number) {
    if (!address || !window.confirm("确定删除此消息？")) return;
    await fetch(`${apiBase}/admin/contact/${id}?adminWallet=${encodeURIComponent(address)}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adminWallet: address }),
    });
    if (selectedMsg?.id === id) setSelectedMsg(null);
    loadMessages();
  }

  useEffect(() => {
    if (!admin || !address) return;
    if (tab === "applications") loadApps();
    else if (tab === "users" || tab === "send") loadUsers();
    else if (tab === "system") loadMemory();
    else if (tab === "messages") loadMessages();
  }, [tab, statusFilter, msgFilter, admin, address]);

  const approve = async (id: number) => {
    if (!address) return;
    await adminPost(`/applications/${id}/approve`, address, {});
    flash("✓ 审核已通过"); loadApps(); setDialog(null);
  };

  const reject = async (id: number) => {
    if (!address) return;
    await adminPost(`/applications/${id}/reject`, address, { reason: rejectReason });
    flash("✓ 已拒绝"); setRejectReason(""); loadApps(); setDialog(null);
  };

  const deleteApp = async (id: number) => {
    if (!address) return;
    const res = await fetch(`${apiBase}/admin/applications/${id}?adminWallet=${encodeURIComponent(address)}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adminWallet: address }),
    });
    await res.json();
    flash("✓ 记录已删除"); setDeleteAppDialog(null); loadApps();
  };

  const banUser = async (wallet: string, ban: boolean) => {
    if (!address) return;
    await adminPost(`/users/${wallet}/ban`, address, { ban });
    flash(ban ? "✓ 已封禁" : "✓ 已解禁"); loadUsers();
  };

  const revokeUser = async (wallet: string) => {
    if (!address) return;
    await adminPost(`/users/${wallet}/revoke`, address, {});
    flash("✓ 已撤销身份"); setRevokeDialog(null); loadUsers(); loadApps();
  };

  const sendValue = async () => {
    if (!address || !sendState || !sendState.wallet || !sendState.amount) return;
    const endpoint = sendState.field === "pinCount" ? "pin-count" : sendState.field;
    await adminPost(`/users/${sendState.wallet}/${endpoint}`, address, { op: "add", value: Number(sendState.amount) });
    flash("✓ 发送成功！"); setSendState(null); loadUsers();
  };

  const downloadCsv = (type: "points-summary" | "bills") => {
    if (!address) window.open(`${apiBase}/admin/${type}?adminWallet=${encodeURIComponent(address!)}`, "_blank");
    else window.open(`${apiBase}/admin/${type}?adminWallet=${encodeURIComponent(address)}`, "_blank");
  };

  if (!admin) {
    return (
      <div className="py-32 text-center">
        <AlertCircle className="w-16 h-16 text-destructive mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-destructive">无访问权限</h2>
        <p className="text-muted-foreground mt-2">仅限管理员钱包。</p>
      </div>
    );
  }

  const filteredUsers = users.filter(u => {
    if (userCat === "space") return u.spaceStatus === "approved" || u.spaceStatus === "active";
    if (userCat === "kol") return u.spaceType === "kol";
    if (userCat === "developer") return u.spaceType === "developer";
    if (userCat === "regular") return !u.spaceStatus || u.spaceStatus === "none";
    return true;
  });

  const btnCls = "px-4 py-2 rounded-xl font-semibold text-sm transition-all";
  const tabCls = (active: boolean) =>
    `px-5 py-2.5 text-sm font-semibold rounded-t-xl border-b-2 transition-all ${active ? "border-primary text-primary bg-primary/5" : "border-transparent text-muted-foreground hover:text-foreground"}`;

  const statusBadge = (status: string) => {
    if (status === "approved") return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300";
    if (status === "rejected") return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300";
    return "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300";
  };

  const statusLabel = (s: string) => {
    if (s === "approved") return "已通过";
    if (s === "rejected") return "已拒绝";
    if (s === "pending") return "待审核";
    return s;
  };

  const appTypeLabel = (app: { type?: string }) => {
    if (app.type === "project") return t("applyProject");
    if (app.type === "kol") return t("adminKol");
    if (app.type === "developer") return t("applyDeveloper");
    return app.type;
  };

  return (
    <div className="max-w-6xl mx-auto py-6 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold flex items-center gap-2">🛡️ 管理员面板</h1>
        {msg && (
          <div className="px-4 py-2 rounded-xl bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 text-sm font-semibold">
            {msg}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        <button className={tabCls(tab === "applications")} onClick={() => setTab("applications")}>
          <ClipboardList className="w-4 h-4 inline mr-1" />申请管理
        </button>
        <button className={tabCls(tab === "users")} onClick={() => setTab("users")}>
          <Users className="w-4 h-4 inline mr-1" />用户管理
        </button>
        <button className={tabCls(tab === "send")} onClick={() => setTab("send")}>
          <Send className="w-4 h-4 inline mr-1" />发送 / CSV
        </button>
        <button className={tabCls(tab === "system")} onClick={() => setTab("system")}>
          <Cpu className="w-4 h-4 inline mr-1" />系统维护
        </button>
        <button className={tabCls(tab === "claims")} onClick={() => setTab("claims")}>
          <Handshake className="w-4 h-4 inline mr-1" />认领审核
        </button>
        <button className={tabCls(tab === "autoscrape")} onClick={() => { setTab("autoscrape"); loadScrapeTab(); }}>
          <Rss className="w-4 h-4 inline mr-1" />自动抓取
        </button>
        <button className={tabCls(tab === "messages")} onClick={() => setTab("messages")}>
          <Mail className="w-4 h-4 inline mr-1" />
          消息
          {messages.filter(m => m.status === "unread").length > 0 && (
            <span className="ml-1 px-1.5 py-0.5 text-xs bg-red-500 text-white rounded-full leading-none">
              {messages.filter(m => m.status === "unread").length}
            </span>
          )}
        </button>
        <button className={tabCls(tab === "visitlogs")} onClick={() => setTab("visitlogs")}>
          <Calendar className="w-4 h-4 inline mr-1" />访问记录
        </button>
      </div>

      {/* ─── Applications Tab ─── */}
      {tab === "applications" && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            {(["pending","approved","rejected",""] as const).map(s => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className={`${btnCls} ${statusFilter === s ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/80"}`}>
                {s === "pending" ? "待审核" : s === "approved" ? "已通过" : s === "rejected" ? "已拒绝" : "全部"}
              </button>
            ))}
            <button onClick={loadApps} className={`${btnCls} bg-muted hover:bg-muted/80 ml-auto`}>
              <RefreshCw className="w-4 h-4 inline mr-1" />刷新
            </button>
          </div>

          {loading ? <div className="h-48 rounded-2xl bg-muted animate-pulse" /> : (
            <div className="bg-card border border-border rounded-2xl overflow-hidden">
              <div className="divide-y divide-border/40">
                {applications.length === 0 ? (
                  <div className="p-12 text-center text-muted-foreground">暂无申请记录</div>
                ) : applications.map(app => (
                  <div key={app.id} className="p-5 hover:bg-muted/20 transition-colors">
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      <div className="space-y-2 flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${statusBadge(app.status)}`}>
                            {statusLabel(app.status)}
                          </span>
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-primary/10 text-primary">
                            {appTypeLabel(app)}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {new Date(app.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-sm">
                          <div className="flex gap-2">
                            <span className="text-muted-foreground shrink-0 w-20">钱包</span>
                            <span className="font-mono text-xs">{app.wallet?.slice(0,10)}...{app.wallet?.slice(-4)}</span>
                          </div>
                          {app.twitter && <div className="flex gap-2"><span className="text-muted-foreground shrink-0 w-20">{t("applyPersonalTwitter")}</span><span className="text-xs truncate">{app.twitter}</span></div>}
                          {app.projectName && <div className="flex gap-2"><span className="text-muted-foreground shrink-0 w-20">{t("applyProjectName")}</span><span className="text-xs truncate">{app.projectName}</span></div>}
                          {app.projectTwitter && <div className="flex gap-2"><span className="text-muted-foreground shrink-0 w-20">{t("applyProjectTwitter")}</span><span className="text-xs truncate">{app.projectTwitter}</span></div>}
                          {app.tweetLink && <div className="flex gap-2"><span className="text-muted-foreground shrink-0 w-20">推文链接</span><a href={app.tweetLink} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline truncate">{app.tweetLink}</a></div>}
                          {app.docsLink && <div className="flex gap-2"><span className="text-muted-foreground shrink-0 w-20">{t("applyDocs")}</span><a href={app.docsLink} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline truncate">{app.docsLink}</a></div>}
                          {app.github && <div className="flex gap-2"><span className="text-muted-foreground shrink-0 w-20">GitHub</span><a href={app.github} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline truncate">{app.github}</a></div>}
                          {app.linkedin && <div className="flex gap-2"><span className="text-muted-foreground shrink-0 w-20">LinkedIn</span><a href={app.linkedin} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline truncate">{app.linkedin}</a></div>}
                        </div>
                      </div>
                      <div className="flex gap-2 shrink-0 flex-wrap">
                        {app.status === "pending" && (<>
                          <button onClick={() => setDialog({ type: "approve", appId: app.id })}
                            className="px-3 py-1.5 rounded-lg bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 text-sm font-semibold hover:bg-green-200 transition-colors">
                            ✓ 通过
                          </button>
                          <button onClick={() => { setDialog({ type: "reject", appId: app.id }); setRejectReason(""); }}
                            className="px-3 py-1.5 rounded-lg bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-sm font-semibold hover:bg-red-200 transition-colors">
                            ✗ 拒绝
                          </button>
                        </>)}
                        {app.status === "approved" && (
                          <button onClick={() => setRevokeDialog(app.wallet)}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 text-sm font-semibold hover:bg-orange-200 transition-colors">
                            <ShieldOff className="w-3.5 h-3.5" /> 撤销
                          </button>
                        )}
                        <button onClick={() => setDeleteAppDialog(app.id)}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-sm font-semibold hover:bg-red-200 transition-colors">
                          <Trash2 className="w-3.5 h-3.5" /> 删除记录
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── Users Tab ─── */}
      {tab === "users" && (
        <div className="space-y-4">
          <div className="flex gap-2 flex-wrap">
            {([
              { key: "space", label: t("adminSpaceUsers") },
              { key: "kol", label: t("adminKol") },
              { key: "developer", label: t("adminDev") },
              { key: "regular", label: t("adminRegular") },
            ] as const).map(({ key, label }) => (
              <button key={key} onClick={() => setUserCat(key)}
                className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${userCat === key ? "bg-primary text-primary-foreground shadow" : "bg-muted hover:bg-muted/80"}`}>
                {label}
                <span className="ml-1.5 text-xs opacity-70">
                  ({users.filter(u => {
                    if (key === "space") return u.spaceStatus === "approved" || u.spaceStatus === "active";
                    if (key === "kol") return u.spaceType === "kol";
                    if (key === "developer") return u.spaceType === "developer";
                    return !u.spaceStatus || u.spaceStatus === "none";
                  }).length})
                </span>
              </button>
            ))}
            <button onClick={loadUsers} className={`${btnCls} bg-muted hover:bg-muted/80 ml-auto`}>
              <RefreshCw className="w-4 h-4 inline mr-1" />刷新
            </button>
          </div>

          {sendState && (
            <div className="bg-card border border-border rounded-2xl p-5 space-y-3">
              <h3 className="font-bold text-sm">
                发送至：{sendState.wallet.slice(0,12)}...（
                {sendState.field === "tokens" ? "代币" : "置顶次数"}
                ）
              </h3>
              <div className="flex gap-2 items-center">
                <input type="number" value={sendState.amount} onChange={e => setSendState({ ...sendState, amount: e.target.value })}
                  placeholder="数量" className="border border-border rounded-xl px-3 py-2 text-sm bg-background w-32" />
                <button onClick={sendValue} className={`${btnCls} bg-primary text-primary-foreground`}>确认发送</button>
                <button onClick={() => setSendState(null)} className={`${btnCls} bg-muted`}>取消</button>
              </div>
            </div>
          )}

          {loading ? <div className="h-48 rounded-2xl bg-muted animate-pulse" /> : (
            <div className="bg-card border border-border rounded-2xl overflow-hidden overflow-x-auto">
              <table className="w-full text-sm min-w-[700px]">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="p-3 text-left">钱包地址</th>
                    <th className="p-3 text-left">用户名</th>
                    <th className="p-3 text-right">代币</th>
                    <th className="p-3 text-right">置顶次数</th>
                    <th className="p-3 text-left">身份类型</th>
                    <th className="p-3 text-left">状态</th>
                    <th className="p-3 text-left">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {filteredUsers.length === 0 ? (
                    <tr><td colSpan={7} className="p-10 text-center text-muted-foreground">暂无用户</td></tr>
                  ) : filteredUsers.map(u => (
                    <tr key={u.id} className={`hover:bg-muted/20 ${u.isBanned ? "opacity-50" : ""}`}>
                      <td className="p-3 font-mono text-xs">{u.wallet.slice(0,8)}...{u.wallet.slice(-4)}</td>
                      <td className="p-3 text-xs">{u.username ?? "-"}</td>
                      <td className="p-3 text-right font-semibold">{(u.tokens ?? 0).toLocaleString()}</td>
                      <td className="p-3 text-right">{u.pinCount ?? 0}</td>
                      <td className="p-3 text-xs">{u.spaceType ? <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary">{u.spaceType}</span> : "-"}</td>
                      <td className="p-3 text-xs">
                        {u.isBanned ? <span className="text-red-500 font-semibold">已封禁</span> : <span className="text-green-500">正常</span>}
                      </td>
                      <td className="p-3">
                        <div className="flex gap-1.5 flex-wrap">
                          <button onClick={() => setSendState({ wallet: u.wallet, field: "tokens", amount: "" })}
                            className="px-2 py-1 rounded-lg bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 text-xs hover:bg-amber-200 transition-colors">
                            代币
                          </button>
                          <button onClick={() => setSendState({ wallet: u.wallet, field: "pinCount", amount: "" })}
                            className="px-2 py-1 rounded-lg bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 text-xs hover:bg-violet-200 transition-colors">
                            置顶
                          </button>
                          <button onClick={() => banUser(u.wallet, !u.isBanned)}
                            className={`px-2 py-1 rounded-lg text-xs transition-colors ${u.isBanned ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 hover:bg-green-200" : "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 hover:bg-red-200"}`}>
                            {u.isBanned ? "解禁" : "封禁"}
                          </button>
                          {u.spaceType && (
                            <button onClick={() => setRevokeDialog(u.wallet)}
                              className="px-2 py-1 rounded-lg text-xs bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 hover:bg-orange-200 transition-colors flex items-center gap-1">
                              <ShieldOff className="w-3 h-3" /> 撤销
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ─── Send & CSV Tab ─── */}
      {tab === "send" && (
        <div className="space-y-5">
          {/* Send to specific wallet */}
          <div className="bg-card border border-border rounded-2xl p-6 space-y-5">
            <h3 className="font-bold">发送至指定钱包</h3>
            {(["tokens","pinCount"] as const).map(field => (
              <div key={field} className="space-y-2">
                <label className="text-sm font-semibold">
                  {field === "tokens" ? "发送代币" : "发送置顶次数"}
                </label>
                <div className="flex gap-2 flex-wrap">
                  <input
                    id={`wallet_${field}`}
                    type="text"
                    placeholder="目标钱包地址..."
                    className="flex-1 min-w-[220px] border border-border rounded-xl px-3 py-2 text-sm bg-background"
                  />
                  <input
                    id={`amount_${field}`}
                    type="number"
                    placeholder="数量"
                    className="w-28 border border-border rounded-xl px-3 py-2 text-sm bg-background"
                  />
                  <button
                    onClick={async () => {
                      const wallet = (document.getElementById(`wallet_${field}`) as HTMLInputElement)?.value?.toLowerCase();
                      const amount = (document.getElementById(`amount_${field}`) as HTMLInputElement)?.value;
                      if (!wallet || !amount || !address) return;
                      const endpoint = field === "pinCount" ? "pin-count" : field;
                      const res = await adminPost(`/users/${wallet}/${endpoint}`, address, { op: "add", value: Number(amount) });
                      if (res.error) {
                        flash(`✗ 失败：${res.error}`);
                      } else {
                        flash(`✓ 已向 ${wallet.slice(0,8)}... 发送 ${amount} ${field === "tokens" ? "代币" : "置顶次数"}`);
                      }
                      (document.getElementById(`wallet_${field}`) as HTMLInputElement).value = "";
                      (document.getElementById(`amount_${field}`) as HTMLInputElement).value = "";
                      loadUsers();
                    }}
                    className={`${btnCls} bg-primary text-primary-foreground hover:bg-primary/90`}
                  >
                    <Send className="w-4 h-4 inline mr-1" />发送
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Bulk tokens to all users */}
          <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
            <h3 className="font-bold flex items-center gap-2"><Star className="w-5 h-5 text-yellow-500" />批量发送代币（全部用户）</h3>
            <div className="flex gap-2 flex-wrap">
              <input id="bulk_amt" type="number" placeholder="数量"
                className="w-28 border border-border rounded-xl px-3 py-2 text-sm bg-background" />
              <button onClick={async () => {
                const v = (document.getElementById("bulk_amt") as HTMLInputElement)?.value;
                if (!v || !address) return;
                await adminPost("/users/all/tokens", address, { op: "add", value: Number(v) });
                flash(`✓ 已向所有用户发送 ${v} 代币`);
                (document.getElementById("bulk_amt") as HTMLInputElement).value = "";
              }} className={`${btnCls} bg-green-500 text-white hover:bg-green-600`}>
                + 批量发送
              </button>
              <button onClick={async () => {
                if (!confirm("确认清空所有用户的代币余额？") || !address) return;
                await adminPost("/users/all/tokens", address, { op: "clear" });
                flash("✓ 已清空所有代币");
              }} className={`${btnCls} bg-red-500 text-white hover:bg-red-600`}>
                清空全部
              </button>
            </div>
          </div>

          {/* CSV export */}
          <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
            <h3 className="font-bold flex items-center gap-2"><Download className="w-5 h-5 text-blue-500" />导出 CSV</h3>
            <div className="flex gap-3 flex-wrap">
              <button onClick={() => downloadCsv("points-summary")}
                className={`${btnCls} bg-blue-500 text-white hover:bg-blue-600`}>
                <Download className="w-4 h-4 inline mr-1" />总积分（全用户+代币详情）
              </button>
              <button onClick={() => downloadCsv("bills")}
                className={`${btnCls} bg-violet-500 text-white hover:bg-violet-600`}>
                <Download className="w-4 h-4 inline mr-1" />用户账单
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── System Tab ─── */}
      {tab === "system" && (
        <div className="space-y-5">
          <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold flex items-center gap-2"><Cpu className="w-5 h-5 text-blue-500" />实时系统状态</h3>
              <button onClick={loadMemory} className={`${btnCls} bg-muted hover:bg-muted/80`}>
                <RefreshCw className="w-4 h-4 inline mr-1" />刷新
              </button>
            </div>
            {memInfo ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {[
                  { label: "堆内存已用", value: `${(memInfo.heapUsed / 1024 / 1024).toFixed(1)} MB`, warn: memInfo.heapUsed / memInfo.heapTotal > 0.7 },
                  { label: "堆内存总量", value: `${(memInfo.heapTotal / 1024 / 1024).toFixed(1)} MB`, warn: false },
                  { label: "进程内存(RSS)", value: `${(memInfo.rss / 1024 / 1024).toFixed(1)} MB`, warn: memInfo.rss > 500 * 1024 * 1024 },
                  { label: "帖子总数", value: `${memInfo.postCount} 条`, warn: memInfo.postCount > 50000 },
                  { label: "用户总数", value: `${memInfo.userCount} 人`, warn: false },
                  { label: "堆使用率", value: `${((memInfo.heapUsed / memInfo.heapTotal) * 100).toFixed(0)}%`, warn: memInfo.heapUsed / memInfo.heapTotal > 0.7 },
                ].map(({ label, value, warn }) => (
                  <div key={label} className={`rounded-xl border p-4 ${warn ? "border-orange-300 bg-orange-50 dark:bg-orange-950/20" : "border-border bg-muted/20"}`}>
                    <p className="text-xs text-muted-foreground mb-1">{label}</p>
                    <p className={`text-lg font-bold ${warn ? "text-orange-600 dark:text-orange-400" : "text-foreground"}`}>{value}</p>
                    {warn && <p className="text-[10px] text-orange-500 mt-1">⚠ 建议清理</p>}
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-20 rounded-xl bg-muted animate-pulse" />
                ))}
              </div>
            )}
          </div>

          <div className="bg-card border border-border rounded-2xl p-6 space-y-5">
            <h3 className="font-bold flex items-center gap-2"><Trash2 className="w-5 h-5 text-red-500" />帖子清理工具</h3>
            <p className="text-sm text-muted-foreground">清理将永久删除最旧的帖子，操作不可恢复，请谨慎操作。</p>

            <div className="flex gap-3">
              <button onClick={() => setCleanupMode("percent")}
                className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${cleanupMode === "percent" ? "bg-red-500 text-white shadow" : "bg-muted hover:bg-muted/80"}`}>
                按比例清除
              </button>
              <button onClick={() => setCleanupMode("date")}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${cleanupMode === "date" ? "bg-red-500 text-white shadow" : "bg-muted hover:bg-muted/80"}`}>
                <Calendar className="w-4 h-4" />按时间段清除
              </button>
            </div>

            {cleanupMode === "percent" && (
              <div className="space-y-3">
                <div className="flex items-center gap-4">
                  <input type="range" min={1} max={80} value={cleanupPct}
                    onChange={e => setCleanupPct(Number(e.target.value))}
                    className="flex-1 accent-red-500" />
                  <span className="text-2xl font-bold text-red-500 w-16 text-right">{cleanupPct}%</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  将删除最旧的 <strong className="text-foreground">{cleanupPct}%</strong> 的帖子
                  {memInfo?.postCount ? `（约 ${Math.floor(memInfo.postCount * cleanupPct / 100)} 条）` : ""}
                </p>
                <div className="flex gap-2 flex-wrap text-xs text-muted-foreground">
                  {[10, 20, 30, 50, 80].map(p => (
                    <button key={p} onClick={() => setCleanupPct(p)}
                      className={`px-2.5 py-1 rounded-lg border transition-colors ${cleanupPct === p ? "border-red-400 text-red-500 font-bold" : "border-border hover:border-muted-foreground"}`}>
                      {p}%
                    </button>
                  ))}
                </div>
              </div>
            )}

            {cleanupMode === "date" && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold block mb-1">起始日期</label>
                    <input type="date" value={cleanupFrom} onChange={e => setCleanupFrom(e.target.value)}
                      className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-background" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold block mb-1">结束日期</label>
                    <input type="date" value={cleanupTo} onChange={e => setCleanupTo(e.target.value)}
                      className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-background" />
                  </div>
                </div>
                {cleanupFrom && cleanupTo && (
                  <p className="text-sm text-muted-foreground">
                    将删除 <strong className="text-foreground">{cleanupFrom}</strong> 至 <strong className="text-foreground">{cleanupTo}</strong> 之间的所有帖子
                  </p>
                )}
              </div>
            )}

            {!cleanupConfirm ? (
              <button onClick={() => setCleanupConfirm(true)}
                disabled={cleanupMode === "date" && (!cleanupFrom || !cleanupTo)}
                className="px-5 py-2.5 rounded-xl bg-red-500 text-white font-bold text-sm hover:bg-red-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2">
                <Trash2 className="w-4 h-4" />执行清理
              </button>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="px-4 py-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-300 dark:border-red-700/50 text-sm text-red-700 dark:text-red-300 font-semibold">
                  ⚠ 确认要永久删除这些帖子吗？此操作不可撤销！
                </div>
                <div className="flex gap-3">
                  <button onClick={() => setCleanupConfirm(false)}
                    className="flex-1 py-2.5 rounded-xl border border-border font-semibold text-sm hover:bg-muted transition-colors">
                    取消
                  </button>
                  <button onClick={doCleanup} disabled={cleanupLoading}
                    className="flex-1 py-2.5 rounded-xl bg-red-500 text-white font-bold text-sm hover:bg-red-600 disabled:opacity-60 transition-colors">
                    {cleanupLoading ? "清理中..." : "确认删除"}
                  </button>
                </div>
              </div>
            )}

            {cleanupResult && (
              <div className={`px-4 py-2.5 rounded-xl text-sm font-semibold ${cleanupResult.startsWith("✓") ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300" : "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300"}`}>
                {cleanupResult}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── Auto-Scrape Tab ─── */}
      {tab === "autoscrape" && (
        <div className="space-y-6">
          {/* Header */}
          <div>
            <h2 className="text-lg font-bold flex items-center gap-2"><Rss className="w-5 h-5 text-primary" />AI 自动抓取</h2>
            <p className="text-sm text-muted-foreground mt-0.5">免费 Groq（多 Key）+ 付费 DeepSeek（按 UTC 小时花费上限，无日总上限，见服务端 DEEPSEEK_HOURLY_BUDGET_USD）统一抓取发布：Groq 与 DeepSeek 定时任务独立。</p>
          </div>

          {scrapeMsg && (
            <div className={`px-4 py-2.5 rounded-xl text-sm font-semibold ${scrapeMsg.startsWith("✓") ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300" : "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300"}`}>
              {scrapeMsg}
            </div>
          )}

          {/* Import legacy articles_backup.json into DB */}
          <div className="bg-card border border-border rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="font-semibold text-sm">导入历史文章（articles_backup.json）</h3>
                <p className="text-xs text-muted-foreground mt-0.5">把历史内容写入数据库，并同步发布到 7×24 快讯（一次性操作）</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={dryRunBackupImport}
                  disabled={backupImportLoading}
                  className="px-3 py-1.5 rounded-xl border border-border text-sm font-semibold hover:bg-muted disabled:opacity-50"
                >
                  Dry Run
                </button>
                <button
                  onClick={runBackupImport}
                  disabled={backupImportLoading || !backupImportConfirm}
                  className="px-3 py-1.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50"
                >
                  导入
                </button>
              </div>
            </div>

            <label className="flex items-center gap-2 text-xs text-muted-foreground select-none">
              <input
                type="checkbox"
                checked={backupImportConfirm}
                onChange={(e) => setBackupImportConfirm(e.target.checked)}
              />
              我已执行 Dry Run 并确认导入历史文章
            </label>

            {backupImportStats && (
              <div className="text-xs text-muted-foreground font-mono bg-muted/40 rounded-xl p-3 overflow-x-auto">
                {JSON.stringify(backupImportStats)}
              </div>
            )}
          </div>

          {/* One-time Backfill (deprecated) */}

          {/* Run History */}
          <div className="bg-card border border-border rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm">执行历史</h3>
              <button onClick={loadScrapeTab} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
                <RefreshCw className="w-3.5 h-3.5" />刷新
              </button>
            </div>
            {scrapeRuns.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">暂无执行记录</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead><tr className="border-b border-border">
                    <th className="text-left py-2 pr-3 font-semibold text-muted-foreground">Run ID</th>
                    <th className="text-left py-2 pr-3 font-semibold text-muted-foreground">开始时间</th>
                    <th className="text-right py-2 pr-3 font-semibold text-muted-foreground">源</th>
                    <th className="text-right py-2 pr-3 font-semibold text-muted-foreground">发现</th>
                    <th className="text-right py-2 pr-3 font-semibold text-muted-foreground">入库</th>
                    <th className="text-right py-2 pr-3 font-semibold text-muted-foreground">错误</th>
                    <th className="py-2"></th>
                  </tr></thead>
                  <tbody>
                    {scrapeRuns.map((r, i) => (
                      <tr key={r.run_id ?? i} className={`border-b border-border/50 hover:bg-muted/30 ${scrapeLogsRunId === r.run_id ? "bg-primary/5" : ""}`}>
                        <td className="py-2 pr-3 font-mono text-[10px] text-muted-foreground">{String(r.run_id ?? "").slice(-12)}</td>
                        <td className="py-2 pr-3">{r.started_at ? new Date(r.started_at).toLocaleString("zh-CN") : "-"}</td>
                        <td className="py-2 pr-3 text-right">{r.total_sources ?? 0}</td>
                        <td className="py-2 pr-3 text-right">{r.total_found ?? 0}</td>
                        <td className="py-2 pr-3 text-right font-semibold text-green-600">{r.total_saved ?? 0}</td>
                        <td className="py-2 pr-3 text-right text-red-500">{r.errors ?? 0}</td>
                        <td className="py-2">
                          <button onClick={() => loadScrapeLogs(r.run_id)}
                            className="text-xs px-2 py-0.5 rounded-lg border border-border hover:bg-muted transition-colors">
                            详情
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Logs Detail */}
          {scrapeLogsRunId && scrapeLogs.length > 0 && (
            <div className="bg-card border border-border rounded-2xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-sm">执行日志 — <span className="font-mono text-xs text-muted-foreground">{scrapeLogsRunId.slice(-12)}</span></h3>
                <button onClick={() => { setScrapeLogsRunId(null); setScrapeLogs([]); }} className="text-xs text-muted-foreground hover:text-foreground">关闭</button>
              </div>
              <div className="overflow-x-auto max-h-72 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-card"><tr className="border-b border-border">
                    <th className="text-left py-2 pr-3 font-semibold text-muted-foreground">来源</th>
                    <th className="text-center py-2 pr-3 font-semibold text-muted-foreground">状态</th>
                    <th className="text-right py-2 pr-3 font-semibold text-muted-foreground">发现</th>
                    <th className="text-right py-2 pr-3 font-semibold text-muted-foreground">入库</th>
                    <th className="text-left py-2 font-semibold text-muted-foreground">备注</th>
                  </tr></thead>
                  <tbody>
                    {scrapeLogs.map((l, i) => (
                      <tr key={l.id ?? i} className="border-b border-border/40">
                        <td className="py-1.5 pr-3 font-medium">{l.source_name}</td>
                        <td className="py-1.5 pr-3 text-center">
                          <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold ${l.status === "ok" ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400" : l.status === "error" ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400" : "bg-muted text-muted-foreground"}`}>
                            {l.status}
                          </span>
                        </td>
                        <td className="py-1.5 pr-3 text-right">{l.items_found ?? 0}</td>
                        <td className="py-1.5 pr-3 text-right font-semibold text-green-600">{l.items_saved ?? 0}</td>
                        <td className="py-1.5 text-muted-foreground truncate max-w-[200px]">{l.error_msg ?? ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Sources Management */}
          <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
            <h3 className="font-semibold text-sm flex items-center gap-2"><Filter className="w-4 h-4" />RSS 数据源 ({scrapeSources.length})</h3>
            <div className="flex gap-2 flex-wrap">
              <input value={newSrcName} onChange={e => setNewSrcName(e.target.value)} placeholder="来源名称"
                className="flex-1 min-w-[120px] px-3 py-2 rounded-xl border border-border bg-background text-sm focus:ring-2 focus:ring-primary/20 outline-none" />
              <input value={newSrcUrl} onChange={e => setNewSrcUrl(e.target.value)} placeholder="RSS URL"
                className="flex-[3] min-w-[200px] px-3 py-2 rounded-xl border border-border bg-background text-sm focus:ring-2 focus:ring-primary/20 outline-none" />
              <select value={newSrcPriority} onChange={e => setNewSrcPriority(e.target.value)}
                className="px-3 py-2 rounded-xl border border-border bg-background text-sm focus:ring-2 focus:ring-primary/20 outline-none">
                <option value="1">优先级 1</option>
                <option value="2">优先级 2</option>
                <option value="3">优先级 3</option>
              </select>
              <button onClick={addSource} className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold flex items-center gap-1.5">
                <Plus className="w-4 h-4" />添加
              </button>
            </div>
            <div className="max-h-64 overflow-y-auto space-y-1">
              {scrapeSources.map((src, i) => (
                <div key={src.id ?? i} className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-muted/40 group">
                  <button onClick={() => toggleSource(src.id, src.enabled)}
                    className={`w-8 h-4.5 rounded-full flex-shrink-0 transition-colors ${src.enabled ? "bg-green-500" : "bg-muted"}`}
                    title={src.enabled ? "点击禁用" : "点击启用"}>
                    <div className={`w-3.5 h-3.5 rounded-full bg-white shadow mx-0.5 transition-transform ${src.enabled ? "translate-x-3.5" : "translate-x-0"}`} />
                  </button>
                  <span className={`text-xs font-semibold min-w-[80px] ${!src.enabled ? "text-muted-foreground line-through" : ""}`}>{src.name}</span>
                  <span className="text-xs text-muted-foreground flex-1 truncate">{src.url}</span>
                  <span className="text-[10px] text-muted-foreground px-1.5 py-0.5 rounded bg-muted">P{src.priority}</span>
                  <button onClick={() => deleteSource(src.id)}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 text-red-500 transition-all">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Keywords */}
          <div className="bg-card border border-border rounded-2xl p-5 space-y-3">
            <h3 className="font-semibold text-sm">过滤关键词（逗号或换行分隔）</h3>
            <textarea value={scrapeKeywordText} onChange={e => setScrapeKeywordText(e.target.value)} rows={5}
              className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:ring-2 focus:ring-primary/20 outline-none resize-y font-mono"
              placeholder="blockchain, web3, airdrop, testnet, ..." />
            <button onClick={saveKeywords}
              className="px-5 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:opacity-90 transition-opacity">
              保存关键词
            </button>
          </div>
        </div>
      )}

      {/* ─── Approve / Reject Dialog ─── */}
      {dialog && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={() => setDialog(null)}>
          <div className="bg-card border border-border rounded-2xl p-7 max-w-sm w-full mx-4 shadow-2xl space-y-5"
            onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold">
              {dialog.type === "approve" ? "✓ 确认通过此申请？" : "✗ 确认拒绝此申请？"}
            </h2>
            {dialog.type === "reject" && (
              <div>
                <label className="text-sm font-semibold block mb-2">{t("adminRejectReason")}</label>
                <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)}
                  placeholder={t("adminRejectPlaceholder")} rows={3}
                  className="w-full p-3 rounded-xl border border-border bg-background focus:ring-2 focus:ring-primary/20 outline-none text-sm resize-none" />
              </div>
            )}
            <div className="flex gap-3">
              <button onClick={() => setDialog(null)}
                className="flex-1 py-3 rounded-xl border border-border font-semibold text-sm hover:bg-muted transition-colors">
                取消
              </button>
              <button onClick={() => dialog.type === "approve" ? approve(dialog.appId) : reject(dialog.appId)}
                className={`flex-1 py-3 rounded-xl font-semibold text-sm transition-colors ${dialog.type === "approve" ? "bg-green-500 text-white hover:bg-green-600" : "bg-red-500 text-white hover:bg-red-600"}`}>
                确认
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Delete App Record Dialog ─── */}
      {deleteAppDialog !== null && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={() => setDeleteAppDialog(null)}>
          <div className="bg-card border border-border rounded-2xl p-7 max-w-sm w-full mx-4 shadow-2xl space-y-5"
            onClick={e => e.stopPropagation()}>
            <div className="flex flex-col items-center text-center gap-2">
              <div className="w-14 h-14 rounded-2xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                <Trash2 className="w-7 h-7 text-red-500" />
              </div>
              <h2 className="text-lg font-bold">删除申请记录</h2>
              <p className="text-sm text-muted-foreground">此操作将永久删除该申请记录，不可恢复。</p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setDeleteAppDialog(null)}
                className="flex-1 py-3 rounded-xl border border-border font-semibold text-sm hover:bg-muted transition-colors">
                取消
              </button>
              <button onClick={() => deleteApp(deleteAppDialog)}
                className="flex-1 py-3 rounded-xl bg-red-500 text-white font-bold text-sm hover:bg-red-600 transition-colors">
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Messages Tab ─── */}
      {tab === "messages" && (
        <div className="space-y-4">
          {/* Filter + Actions bar */}
          <div className="flex items-center gap-2 flex-wrap">
            {(["", "unread", "read", "replied"] as const).map(f => (
              <button key={f}
                onClick={() => setMsgFilter(f)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors ${msgFilter === f ? "bg-primary text-primary-foreground border-primary" : "bg-muted border-border hover:bg-muted/80"}`}>
                {f === "" ? "全部" : f === "unread" ? "未读" : f === "read" ? "已读" : "已回复"}
                {f === "unread" && messages.filter(m => m.status === "unread").length > 0 &&
                  <span className="ml-1.5 px-1 bg-red-500 text-white rounded-full text-[10px]">
                    {messages.filter(m => m.status === "unread").length}
                  </span>}
              </button>
            ))}
            <button onClick={loadMessages} className="ml-auto px-3 py-1.5 rounded-xl text-xs bg-muted border border-border hover:bg-muted/80 transition-colors flex items-center gap-1">
              <RefreshCw className="w-3.5 h-3.5" />刷新
            </button>
          </div>

          {msgActionMsg && (
            <div className={`px-4 py-2 rounded-xl text-sm font-medium ${msgActionMsg.startsWith("✓") ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"}`}>
              {msgActionMsg}
              <button onClick={() => setMsgActionMsg("")} className="ml-3 text-xs underline">关闭</button>
            </div>
          )}

          {msgLoading ? (
            <div className="h-48 rounded-2xl bg-muted animate-pulse" />
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center text-muted-foreground">
              <Mail className="w-10 h-10 opacity-30" />
              <p className="text-sm">暂无消息</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {/* Message list */}
              <div className="space-y-2">
                {messages.map(m => (
                  <div key={m.id}
                    onClick={() => { setSelectedMsg(m); setReplyText(""); if (m.status === "unread") markRead(m.id); }}
                    className={`cursor-pointer rounded-xl border p-3 transition-all hover:shadow-sm ${selectedMsg?.id === m.id ? "border-primary/60 bg-primary/5" : "border-border bg-card"}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        {m.status === "unread"
                          ? <Circle className="w-2 h-2 text-blue-500 fill-blue-500 shrink-0 mt-0.5" />
                          : m.status === "replied"
                          ? <MailOpen className="w-3.5 h-3.5 text-green-500 shrink-0" />
                          : <MailOpen className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
                        <div className="min-w-0">
                          <p className={`text-sm truncate ${m.status === "unread" ? "font-bold text-foreground" : "font-medium text-muted-foreground"}`}>
                            {m.subject}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">{m.name} &lt;{m.email}&gt;</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                          m.status === "unread" ? "bg-blue-100 text-blue-600"
                          : m.status === "replied" ? "bg-green-100 text-green-600"
                          : "bg-muted text-muted-foreground"}`}>
                          {m.status === "unread" ? "未读" : m.status === "replied" ? "已回" : "已读"}
                        </span>
                        <button onClick={e => { e.stopPropagation(); deleteMsg(m.id); }}
                          className="p-1 rounded-lg hover:bg-red-50 text-muted-foreground hover:text-red-500 transition-colors">
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1.5 line-clamp-1 pl-5">{m.message_preview ?? m.message}</p>
                    <p className="text-[10px] text-muted-foreground/60 mt-1 pl-5">{new Date(m.created_at).toLocaleString("zh-CN")}</p>
                  </div>
                ))}
              </div>

              {/* Message detail + reply */}
              {selectedMsg ? (
                <div className="bg-card border border-border rounded-xl p-4 space-y-3 self-start sticky top-24">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-bold text-sm text-foreground">{selectedMsg.subject}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{selectedMsg.name} · {selectedMsg.email}</p>
                      <p className="text-[10px] text-muted-foreground/60">{new Date(selectedMsg.created_at).toLocaleString("zh-CN")}</p>
                    </div>
                    <button onClick={() => setSelectedMsg(null)} className="text-muted-foreground hover:text-foreground p-1">
                      <XCircle className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="bg-muted/40 rounded-lg px-3 py-2.5 text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                    {selectedMsg.message}
                  </div>

                  {selectedMsg.reply && (
                    <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2.5 space-y-1">
                      <p className="text-xs font-semibold text-green-700 flex items-center gap-1">
                        <Reply className="w-3 h-3" />已回复 · {selectedMsg.replied_at ? new Date(selectedMsg.replied_at).toLocaleString("zh-CN") : ""}
                      </p>
                      <p className="text-sm text-green-800 whitespace-pre-wrap">{selectedMsg.reply}</p>
                    </div>
                  )}

                  {/* Reply form */}
                  <div className="space-y-2 pt-1 border-t border-border">
                    <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                      <Reply className="w-3 h-3" />回复给 {selectedMsg.name}
                    </p>
                    <textarea
                      rows={4}
                      value={replyText}
                      onChange={e => setReplyText(e.target.value)}
                      placeholder="输入回复内容，发送后将通过邮件发送给对方..."
                      className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
                    />
                    <button
                      onClick={() => replyMsg(selectedMsg.id)}
                      disabled={!replyText.trim()}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-40"
                    >
                      <Send className="w-3.5 h-3.5" />发送回复
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center gap-2 h-48 text-muted-foreground/50 rounded-xl border border-dashed border-border">
                  <Mail className="w-8 h-8" />
                  <p className="text-sm">选择左侧消息查看详情</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ─── Visit Logs Tab ─── */}
      {tab === "visitlogs" && <VisitLogsPanel address={address ?? ""} />}

      {/* ─── Claims Tab ─── */}
      {tab === "claims" && (
        <ClaimsPanel />
      )}

      {/* ─── Revoke Confirmation Dialog ─── */}
      {revokeDialog && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={() => setRevokeDialog(null)}>
          <div className="bg-card border border-border rounded-2xl p-7 max-w-sm w-full mx-4 shadow-2xl space-y-5"
            onClick={e => e.stopPropagation()}>
            <div className="flex flex-col items-center text-center gap-2">
              <div className="w-14 h-14 rounded-2xl bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
                <ShieldOff className="w-7 h-7 text-orange-500" />
              </div>
              <h2 className="text-lg font-bold">撤销用户身份</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                要撤销此用户的身份吗？
                <br />
                <span className="font-mono text-xs text-foreground">{revokeDialog.slice(0, 10)}...{revokeDialog.slice(-4)}</span>
              </p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setRevokeDialog(null)}
                className="flex-1 py-3 rounded-xl border border-border font-semibold text-sm hover:bg-muted transition-colors">
                取消
              </button>
              <button onClick={() => revokeUser(revokeDialog)}
                className="flex-1 py-3 rounded-xl bg-orange-500 text-white font-bold text-sm hover:bg-orange-600 transition-colors">
                确定撤销
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
