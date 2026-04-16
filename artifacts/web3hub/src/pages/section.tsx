import { useState, useEffect } from "react";
import { EventList } from "@/components/events/EventList";
import { Unified724Feed } from "@/components/Unified724Feed";
import { useParams } from "wouter";
import { useLang } from "@/lib/i18n";
import { Link } from "wouter";
import { Search, ExternalLink } from "lucide-react";
import { generateGradient, truncateAddress } from "@/lib/utils";
import { RoleBadge } from "@/components/role-badge";
import { TagBadge } from "@/components/post-card";


const SECTION_ICONS: Record<string, string> = {
  flash: "⚡",
  testnet: "🧪",
  ido: "🚀",
  funding: "💰",
  airdrop: "🎁",
  meme: "🐸",
  policy: "⚖️",
  recruiting: "💼",
  nodes: "⚙️",
  unlock: "🔓",
  quest: "🎁",
  developer: "👨‍💻",
  devbounty: "🛡️",
  grant:     "🎁",
  security: "🔐",
  integration: "🔗",
  events: "🎁",
  jobs: "🗂️",
  ecosystem: "🌍",
  partners: "🤝",
  hackathon: "🏆",
  ama: "🎤",
  bugbounty: "🐛",
  showcase: "✨",
  industry: "📰",
};

const SECTION_COLORS: Record<string, string> = {
  flash:       "from-yellow-50 to-amber-50 border-yellow-200 dark:from-yellow-950/30 dark:to-amber-950/30 dark:border-yellow-900/50",
  testnet:     "from-blue-50 to-cyan-50 border-blue-100 dark:from-blue-950/30 dark:to-cyan-950/30 dark:border-blue-900/50",
  ido:         "from-purple-50 to-pink-50 border-purple-100 dark:from-purple-950/30 dark:to-pink-950/30 dark:border-purple-900/50",
  funding:     "from-emerald-50 to-green-50 border-emerald-100 dark:from-emerald-950/30 dark:to-green-950/30 dark:border-emerald-900/50",
  airdrop:     "from-green-50 to-teal-50 border-green-100 dark:from-green-950/30 dark:to-teal-950/30 dark:border-teal-900/50",
  meme:        "from-yellow-50 to-lime-50 border-yellow-100 dark:from-yellow-950/30 dark:to-lime-950/30 dark:border-yellow-900/50",
  policy:      "from-stone-50 to-zinc-50 border-stone-100 dark:from-stone-900/30 dark:to-zinc-900/30 dark:border-stone-800",
  recruiting:  "from-sky-50 to-blue-50 border-sky-100 dark:from-sky-950/30 dark:to-blue-950/30 dark:border-sky-900/50",
  nodes:       "from-slate-50 to-gray-50 border-slate-100 dark:from-slate-900/30 dark:to-gray-900/30 dark:border-slate-800",
  unlock:      "from-amber-50 to-orange-50 border-amber-100 dark:from-amber-950/30 dark:to-orange-950/30 dark:border-amber-900/50",
  quest:       "from-cyan-50 to-teal-50 border-cyan-100 dark:from-cyan-950/30 dark:to-teal-950/30 dark:border-cyan-900/50",
  developer:   "from-indigo-50 to-violet-50 border-indigo-100 dark:from-indigo-950/30 dark:to-violet-950/30 dark:border-indigo-900/50",
  devbounty:   "from-indigo-50 to-rose-50 border-indigo-100 dark:from-indigo-950/30 dark:to-rose-950/30 dark:border-indigo-900/50",
  grant:       "from-orange-50 to-amber-50 border-orange-100 dark:from-orange-950/30 dark:to-amber-950/30 dark:border-orange-900/50",
  security:    "from-red-50 to-orange-50 border-red-100 dark:from-red-950/30 dark:to-orange-950/30 dark:border-red-900/50",
  integration: "from-indigo-50 to-blue-50 border-indigo-100 dark:from-indigo-950/30 dark:to-blue-950/30 dark:border-indigo-900/50",
  events:      "from-yellow-50 to-amber-50 border-yellow-100 dark:from-yellow-950/30 dark:to-amber-950/30 dark:border-amber-900/50",
  jobs:        "from-sky-50 to-blue-50 border-sky-100 dark:from-sky-950/30 dark:to-blue-950/30 dark:border-sky-900/50",
  ecosystem:   "from-teal-50 to-cyan-50 border-teal-100 dark:from-teal-950/30 dark:to-cyan-950/30 dark:border-teal-900/50",
  partners:    "from-violet-50 to-purple-50 border-violet-100 dark:from-violet-950/30 dark:to-purple-950/30 dark:border-purple-900/50",
  hackathon:   "from-orange-50 to-red-50 border-orange-100 dark:from-orange-950/30 dark:to-red-950/30 dark:border-red-900/50",
  ama:         "from-fuchsia-50 to-pink-50 border-fuchsia-100 dark:from-fuchsia-950/30 dark:to-pink-950/30 dark:border-pink-900/50",
  bugbounty:   "from-rose-50 to-red-50 border-rose-100 dark:from-rose-950/30 dark:to-red-950/30 dark:border-red-900/50",
  showcase:    "from-amber-50 to-yellow-50 border-amber-100 dark:from-amber-950/30 dark:to-yellow-950/30 dark:border-amber-900/50",
  industry:    "from-slate-50 to-blue-50 border-slate-100 dark:from-slate-900/30 dark:to-blue-950/30 dark:border-slate-800",
};

const SECTION_I18N_KEYS: Record<string, { label: string; desc: string }> = {
  flash:       { label: "sFlashLabel",       desc: "sFlashDesc" },
  testnet:     { label: "sTestnetLabel",     desc: "sTestnetDesc" },
  ido:         { label: "sIdoLabel",         desc: "sIdoDesc" },
  funding:     { label: "sFundingLabel",     desc: "sFundingDesc" },
  airdrop:     { label: "sAirdropLabel",     desc: "sAirdropDesc" },
  meme:        { label: "sMemeLabel",        desc: "sMemeDesc" },
  policy:      { label: "sPolicyLabel",      desc: "sPolicyDesc" },
  recruiting:  { label: "sRecruitingLabel",  desc: "sRecruitingDesc" },
  nodes:       { label: "sNodesLabel",       desc: "sNodesDesc" },
  unlock:      { label: "sUnlockLabel",      desc: "sUnlockDesc" },
  quest:       { label: "sQuestLabel",       desc: "sQuestDesc" },
  industry:    { label: "sIndustryLabel",    desc: "sIndustryDesc" },
  developer:   { label: "sDeveloperLabel",   desc: "sDeveloperDesc" },
  devbounty:   { label: "sDevbountyLabel",   desc: "sDevbountyDesc" },
  grant:       { label: "sGrantLabel",       desc: "sGrantDesc" },
  security:    { label: "sSecurityLabel",    desc: "sSecurityDesc" },
  integration: { label: "sIntegrationLabel", desc: "sIntegrationDesc" },
  events:      { label: "sEventsLabel",      desc: "sEventsDesc" },
  jobs:        { label: "sJobsLabel",        desc: "sJobsDesc" },
  ecosystem:   { label: "sEcosystemLabel",   desc: "sEcosystemDesc" },
  partners:    { label: "sPartnersLabel",    desc: "sPartnersDesc" },
  hackathon:   { label: "sHackathonLabel",   desc: "sHackathonDesc" },
  ama:         { label: "sAmaLabel",         desc: "sAmaDesc" },
  bugbounty:   { label: "sBugbountyLabel",   desc: "sBugbountyDesc" },
  showcase:    { label: "sShowcaseLabel",    desc: "sShowcaseDesc" },
};

type MemberType = "project" | "kol" | "developer";
const TAB_TYPES: { key: MemberType; tKey: string }[] = [
  { key: "project",   tKey: "memberTabProject" },
  { key: "kol",       tKey: "memberTabKol"     },
  { key: "developer", tKey: "memberTabDev"     },
];

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

function ShowcaseMemberCard({ member }: { member: Member }) {
  const name = member.username || truncateAddress(member.wallet);
  return (
    <Link href={`/profile/${member.wallet}`}
      className="flex items-center gap-3 px-4 py-3 rounded-xl border border-border/40 bg-card hover:border-primary/40 hover:shadow-sm transition-all cursor-pointer">
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
        <span className="text-xs text-muted-foreground font-mono">{truncateAddress(member.wallet)}</span>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {member.twitter && (
          <a href={`https://x.com/${member.twitter.replace(/^@/, "")}`} target="_blank" rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            className="p-1.5 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-950/30 text-muted-foreground hover:text-blue-500 transition-colors">
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

function ShowcaseDirectory() {
  const { t } = useLang();
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
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
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

      {loading ? (
        <div className="space-y-2">
          {[1,2,3,4,5].map(i => (
            <div key={i} className="h-16 rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
      ) : members.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground text-sm">{t("membersEmpty")}</div>
      ) : (
        <div className="space-y-2">
          {members.map(m => <ShowcaseMemberCard key={m.wallet} member={m} />)}
        </div>
      )}
    </div>
  );
}

export default function SectionPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug ?? "";
  const { t } = useLang();

  const keys = SECTION_I18N_KEYS[slug];
  const sectionLabel = keys ? t(keys.label) : slug;
  const icon = SECTION_ICONS[slug] ?? "📋";

  const isShowcase = slug === "showcase";
  const is724news = slug === "724news" || slug === "flash";

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      {is724news ? (
        <Unified724Feed />
      ) : isShowcase ? (
        <ShowcaseDirectory />
      ) : (
        <EventList key={slug} sectionSlug={slug} sectionName={`${icon} ${sectionLabel}`} />
      )}
    </div>
  );
}
