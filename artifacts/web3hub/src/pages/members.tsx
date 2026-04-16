import { useState, useEffect } from "react";
import { Link } from "wouter";
import { Search, ExternalLink, Calendar } from "lucide-react";
import { useLang } from "@/lib/i18n";
import { generateGradient, truncateAddress } from "@/lib/utils";
import { RoleBadge } from "@/components/role-badge";
import { TagBadge } from "@/components/post-card";

function getApiBase() {
  const base = import.meta.env.BASE_URL ?? "/";
  const parts = base.replace(/\/$/, "").split("/");
  parts.pop();
  return parts.join("/") + "/api";
}

type MemberType = "project" | "kol" | "developer";

interface Member {
  wallet: string;
  username?: string | null;
  avatar?: string | null;
  spaceType?: string | null;
  tags?: string[] | null;
  twitter?: string | null;
  website?: string | null;
  createdAt: string;
}

const TAB_TYPES: { key: MemberType; tKey: string }[] = [
  { key: "project",   tKey: "memberTabProject" },
  { key: "kol",       tKey: "memberTabKol"     },
  { key: "developer", tKey: "memberTabDev"     },
];

function MemberCard({ member }: { member: Member }) {
  const name = member.username || truncateAddress(member.wallet);
  const date = new Date(member.createdAt).toLocaleDateString();
  return (
    <Link href={`/profile/${member.wallet}`}
      className="flex items-center gap-3 px-4 py-3 rounded-xl border border-border/40 bg-card hover:border-primary/40 hover:shadow-sm transition-all group cursor-pointer">
      <div
        className="w-10 h-10 rounded-full shrink-0 border border-border overflow-hidden bg-transparent"
        style={member.avatar
          ? { backgroundImage: `url(${member.avatar})`, backgroundSize: "cover", backgroundPosition: "center" }
          : { background: generateGradient(member.wallet) }}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-0.5">
          <span className="font-semibold text-sm text-foreground truncate">{name}</span>
          <RoleBadge spaceType={member.spaceType} size="xs" />
          {member.tags?.map(tag => <TagBadge key={tag} tag={tag} />)}
        </div>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Calendar className="w-3 h-3 shrink-0" />
          <span>{date}</span>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {member.twitter && (
          <a href={member.twitter} target="_blank" rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            className="p-1.5 rounded-lg hover:bg-sky-50 dark:hover:bg-sky-950/30 text-muted-foreground hover:text-sky-500 transition-colors">
            <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
          </a>
        )}
        {member.website && (
          <a href={member.website} target="_blank" rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            className="p-1.5 rounded-lg hover:bg-green-50 dark:hover:bg-green-950/30 text-muted-foreground hover:text-green-500 transition-colors">
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}
      </div>
    </Link>
  );
}

export default function MembersPage() {
  const { t, lang } = useLang();
  const [activeTab, setActiveTab] = useState<MemberType>("project");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ type: activeTab });
    if (debouncedSearch) params.set("search", debouncedSearch);
    fetch(`${getApiBase()}/users/list?${params}`)
      .then(r => r.json())
      .then(d => setMembers(d.users ?? []))
      .catch(() => setMembers([]))
      .finally(() => setLoading(false));
  }, [activeTab, debouncedSearch]);


  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-1">{t("membersTitle")}</h1>
        <p className="text-muted-foreground text-sm">{t("membersDesc")}</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        {/* Tabs */}
        <div className="flex items-center gap-1.5 bg-muted/50 rounded-xl p-1 shrink-0">
          {TAB_TYPES.map(tab => (
            <button
              key={tab.key}
              onClick={() => { setActiveTab(tab.key); setSearch(""); }}
              className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all ${
                activeTab === tab.key
                  ? "bg-white dark:bg-slate-800 text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t(tab.tKey)}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t("membersSearch")}
            className="w-full pl-9 pr-4 py-2 rounded-xl border border-border bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary transition-all"
          />
        </div>
      </div>

      {/* Member list */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-16 rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
      ) : members.length === 0 ? (
        <div className="py-20 text-center text-muted-foreground text-sm">{t("membersEmpty")}</div>
      ) : (
        <div className="space-y-2">
          {members.map((m, i) => (
            <div key={m.wallet} className="flex items-center gap-3">
              <span className="w-6 text-right text-xs text-muted-foreground font-mono shrink-0">{i + 1}</span>
              <div className="flex-1 min-w-0">
                <MemberCard member={m} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
