import { useParams } from "wouter";
import { useGetMe, useGetPosts } from "@workspace/api-client-react";
import { generateGradient, truncateAddress } from "@/lib/utils";
import { Twitter, Send, Hash, ArrowLeft, User } from "lucide-react";
import { Link } from "wouter";
import { useLang } from "@/lib/i18n";
import { PostCard } from "@/components/post-card";
import { isAdmin } from "@/lib/admin";
import { useWeb3Auth } from "@/lib/web3";

const ROLE_COLORS: Record<string, string> = {
  developer: "bg-blue-500/10 text-blue-500 border-blue-500/30",
  project: "bg-violet-500/10 text-violet-500 border-violet-500/30",
  kol: "bg-amber-500/10 text-amber-500 border-amber-500/30",
};

export default function PublicProfile() {
  const { wallet } = useParams<{ wallet: string }>();
  const { t } = useLang();
  const { address } = useWeb3Auth();
  const viewerIsAdmin = isAdmin(address);

  const { data: userData, isLoading: userLoading } = useGetMe(
    { wallet: wallet ?? "" },
    { query: { enabled: !!wallet } }
  );
  const { data: postsData, refetch: refetchPosts } = useGetPosts(
    { authorWallet: wallet ?? "" } as any,
    { query: { enabled: !!wallet } }
  );

  const user = userData as any;
  const posts = postsData?.posts ?? [];

  if (!wallet) {
    return (
      <div className="max-w-2xl mx-auto py-20 text-center text-muted-foreground">
        Invalid profile link.
      </div>
    );
  }

  const displayName = user?.username || truncateAddress(wallet);
  const spaceType = user?.spaceType ?? null;
  const spaceStatus = user?.spaceStatus ?? null;
  const roleLabel = spaceType === "project" ? t("roleProject")
    : spaceType === "developer" ? t("roleDeveloper")
    : spaceType === "kol" ? "KOL"
    : spaceType;

  const avatarStyle = user?.avatar
    ? { backgroundImage: `url(${user.avatar})`, backgroundSize: "cover", backgroundPosition: "center" }
    : { background: generateGradient(wallet) };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="w-4 h-4" />
        Back
      </Link>

      {userLoading ? (
        <div className="bg-card border border-border rounded-2xl p-8 animate-pulse h-48" />
      ) : (
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="h-20 bg-gradient-to-r from-primary/20 via-primary/10 to-transparent" />
          <div className="px-6 pb-6 -mt-10">
            <div className="flex items-end gap-4 mb-4">
              <div
                className="w-20 h-20 rounded-2xl border-4 border-card shadow-md shrink-0 bg-transparent"
                style={avatarStyle}
              />
              <div className="flex-1 min-w-0 pb-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-xl font-bold truncate">{displayName}</h1>
                  {spaceType && (
                    <span className={`text-xs px-2 py-0.5 rounded-full border font-semibold ${ROLE_COLORS[spaceType] ?? "bg-muted text-muted-foreground border-border"}`}>
                      {roleLabel}
                    </span>
                  )}
                  {spaceStatus === "approved" && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/10 text-green-600 border border-green-500/30 font-semibold">
                      ✓ Space
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground font-mono mt-1 truncate">{wallet}</p>
              </div>
            </div>

            {user?.contact && user?.contactPublic && (
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground mt-1">
                <span className="text-xs text-muted-foreground/60">{t("contactLabel")}：</span>
                <span className="select-all">{user.contact}</span>
              </div>
            )}

            {(user?.twitter || user?.telegram || user?.discord) && (
              <div className="flex flex-wrap gap-3 mt-2 text-sm text-muted-foreground">
                {user.twitter && (
                  <a href={`https://twitter.com/${user.twitter.replace("@","")}`} target="_blank" rel="noreferrer"
                    className="flex items-center gap-1.5 hover:text-foreground transition-colors">
                    <Twitter className="w-4 h-4" />
                    <span>{user.twitter.startsWith("@") ? user.twitter : `@${user.twitter}`}</span>
                  </a>
                )}
                {user.telegram && (
                  <a href={`https://t.me/${user.telegram.replace("@","")}`} target="_blank" rel="noreferrer"
                    className="flex items-center gap-1.5 hover:text-foreground transition-colors">
                    <Send className="w-4 h-4" />
                    <span>{user.telegram}</span>
                  </a>
                )}
                {user.discord && (
                  <span className="flex items-center gap-1.5">
                    <Hash className="w-4 h-4" />
                    {user.discord}
                  </span>
                )}
              </div>
            )}

            {!spaceType && !user && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground mt-2">
                <User className="w-4 h-4" />
                <span>No Space registered</span>
              </div>
            )}
          </div>
        </div>
      )}

      <div>
        <h2 className="text-base font-bold mb-3 flex items-center gap-2">
          {t("myPosts")}
          <span className="text-sm font-normal text-muted-foreground">({posts.length})</span>
        </h2>
        {posts.length === 0 ? (
          <div className="py-16 text-center border border-dashed border-border rounded-2xl bg-card/50">
            <p className="text-muted-foreground text-sm">{t("noPost")}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {posts.map((post) => (
              <PostCard key={post.id} post={post as any} onRefresh={refetchPosts} showPin={viewerIsAdmin} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
