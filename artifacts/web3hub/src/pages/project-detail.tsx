import { useRoute } from "wouter";
import { useGetProject, useGetPosts } from "@workspace/api-client-react";
import { Globe, Twitter, Share2 } from "lucide-react";
import { PostTimeline } from "@/components/post-timeline";

export default function ProjectDetail() {
  const [, params] = useRoute("/project/:id");
  const projectId = params?.id ? parseInt(params.id) : 0;
  
  const { data: project, isLoading } = useGetProject(projectId, { query: { enabled: !!projectId } });
  const { data: posts, isLoading: postsLoading } = useGetPosts({ authorType: project?.ownerWallet }, { query: { enabled: !!project?.ownerWallet } });

  if (isLoading) return <div className="py-32 text-center animate-pulse">加载中...</div>;
  if (!project) return <div className="py-32 text-center text-muted-foreground">项目不存在</div>;

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Project Header */}
      <div className="bg-card rounded-3xl p-8 border border-border shadow-sm flex flex-col sm:flex-row gap-8 items-start sm:items-center">
        <div className="w-24 h-24 sm:w-32 sm:h-32 rounded-2xl bg-transparent border shrink-0 overflow-hidden flex items-center justify-center">
          {project.logo ? (
            <img src={project.logo} alt={project.name} className="w-full h-full object-cover" />
          ) : (
            <span className="text-4xl font-bold text-muted-foreground">{project.name.charAt(0)}</span>
          )}
        </div>
        
        <div className="flex-1 space-y-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-3xl font-display font-bold">{project.name}</h1>
              {project.isPinned && (
                <span className="px-2 py-1 bg-[#00FF9F]/10 text-[#00FF9F] border border-[#00FF9F]/20 rounded text-xs font-bold font-mono">
                  PINNED
                </span>
              )}
            </div>
            <p className="text-lg text-muted-foreground leading-relaxed">
              {project.tagline || "No description provided."}
            </p>
          </div>
          
          <div className="flex flex-wrap gap-2">
            {project.tags?.split(',').map(tag => (
              <span key={tag} className="px-3 py-1 bg-muted rounded-full text-sm text-foreground">
                {tag.trim()}
              </span>
            ))}
            {project.chain && (
              <span className="px-3 py-1 bg-primary/10 text-primary rounded-full text-sm font-medium">
                {project.chain}
              </span>
            )}
          </div>
          
          <div className="flex items-center gap-4 pt-2">
            {project.website && (
              <a href={project.website} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors">
                <Globe className="w-4 h-4" /> 官网
              </a>
            )}
            {project.twitter && (
              <a href={project.twitter} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-[#1DA1F2] transition-colors">
                <Twitter className="w-4 h-4" /> Twitter
              </a>
            )}
            <button className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors ml-auto">
              <Share2 className="w-4 h-4" /> 分享
            </button>
          </div>
        </div>
      </div>

      {/* Project Posts */}
      <div className="space-y-6">
        <h2 className="text-2xl font-bold">项目动态</h2>
        {postsLoading ? (
          <div className="animate-pulse space-y-4">
            <div className="h-32 bg-muted rounded-2xl" />
            <div className="h-32 bg-muted rounded-2xl" />
          </div>
        ) : (
          <PostTimeline 
            posts={posts?.posts || []} 
            avatarBorderColor="border-primary/50"
            emptyMessage="该项目还没有发布过动态"
          />
        )}
      </div>
    </div>
  );
}
