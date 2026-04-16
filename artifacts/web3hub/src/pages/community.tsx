import { useGetPosts } from "@workspace/api-client-react";
import { PostTimeline } from "@/components/post-timeline";
import { useLang } from "@/lib/i18n";

export default function Community() {
  const { t } = useLang();
  const { data, isLoading } = useGetPosts({ section: "community", limit: 50 });

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold mb-2">{t("communityTitle")}</h1>
        <p className="text-muted-foreground">{t("communityDesc")}</p>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1,2,3].map(i => (
            <div key={i} className="h-40 rounded-2xl bg-muted animate-pulse" />
          ))}
        </div>
      ) : (
        <PostTimeline
          posts={data?.posts || []}
          avatarBorderColor="border-border"
          emptyMessage={t("communityEmpty")}
        />
      )}
    </div>
  );
}
