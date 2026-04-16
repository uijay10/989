import { useGetPosts } from "@workspace/api-client-react";
import { PostTimeline } from "@/components/post-timeline";
import { useLang } from "@/lib/i18n";

export default function Showcase() {
  const { t } = useLang();
  const { data, isLoading } = useGetPosts({ section: "showcase", limit: 50 });

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold mb-2">{t("showcaseTitle")}</h1>
        <p className="text-muted-foreground">{t("showcaseDesc")}</p>
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
          avatarBorderColor="border-primary"
          emptyMessage={t("showcaseEmpty")}
        />
      )}
    </div>
  );
}
