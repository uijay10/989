import { Link } from "wouter";
import { formatDistanceToNow } from "date-fns";
import type { Project } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";
import { useLang } from "@/lib/i18n";

interface ProjectCardProps {
  project: Project;
  isPinned?: boolean;
  compact?: boolean;
}

export function ProjectCard({ project, isPinned, compact }: ProjectCardProps) {
  const { t } = useLang();
  const isNew = new Date(project.createdAt).getTime() > Date.now() - 86_400_000;

  /* ── Pinned card: square aspect, shimmer glow border ── */
  if (isPinned) {
    return (
      <div className="relative pinned-card rounded-xl bg-white overflow-hidden transition-transform duration-200 hover:scale-[1.03] hover:z-10 cursor-pointer aspect-square flex flex-col">
        {isNew && (
          <span className="absolute top-2 right-2 z-10 bg-[#FF69B4] text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">
            {t("new")}
          </span>
        )}

        {project.pinnedUntil && (
          <div className="absolute bottom-2 right-2 z-10">
            <span
              className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-black/70"
              style={{ color: "#00FF9F", textShadow: "0 0 6px #00FF9F" }}
            >
              ⏱ {formatDistanceToNow(new Date(project.pinnedUntil))}
            </span>
          </div>
        )}

        <Link href={`/project/${project.id}`} className="flex flex-col items-center justify-center flex-1 p-4 gap-3">
          <div className="w-16 h-16 rounded-full bg-transparent border border-gray-100 overflow-hidden flex items-center justify-center shrink-0">
            {project.logo ? (
              <img src={project.logo} alt={project.name} className="w-full h-full object-cover" />
            ) : (
              <span className="text-2xl font-bold text-muted-foreground">{project.name.charAt(0)}</span>
            )}
          </div>
          <div className="text-center">
            <div className="font-bold text-sm text-foreground line-clamp-1">{project.name}</div>
            {project.latestPostTitle ? (
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{project.latestPostTitle}</p>
            ) : (
              <p className="text-xs text-muted-foreground mt-1 italic">{t("noLatest")}</p>
            )}
          </div>
          <span className="mt-auto inline-flex items-center px-4 py-1.5 rounded-full bg-[#FF69B4] text-white text-xs font-semibold hover:bg-[#ff4fa8] transition-colors">
            {t("view")}
          </span>
        </Link>
      </div>
    );
  }

  /* ── Compact card (regular grid 2-col) ─────────────── */
  if (compact) {
    return (
      <div className={cn(
        "relative bg-card rounded-xl p-3 transition-colors duration-200",
        "hover:bg-muted/50"
      )}>
        {isNew && (
          <span className="absolute -top-1.5 -right-1.5 bg-[#FF69B4] text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full z-10">
            {t("new")}
          </span>
        )}
        <div className="flex items-center gap-3 mb-2">
          <div className="w-9 h-9 rounded-full bg-transparent border border-gray-200 overflow-hidden shrink-0 flex items-center justify-center">
            {project.logo ? (
              <img src={project.logo} alt={project.name} className="w-full h-full object-cover" />
            ) : (
              <span className="text-sm font-bold text-muted-foreground">{project.name.charAt(0)}</span>
            )}
          </div>
          <span className="font-bold text-sm text-foreground truncate">{project.name}</span>
        </div>
        <p className="text-xs text-muted-foreground line-clamp-2 mb-3 min-h-[32px]">
          {project.latestPostTitle || project.tagline || t("noLatest")}
        </p>
        <Link
          href={`/project/${project.id}`}
          className="block text-center w-full py-1.5 rounded-lg bg-[#FF69B4] text-white text-xs font-semibold hover:bg-[#ff4fa8] transition-colors"
        >
          {t("view")}
        </Link>
      </div>
    );
  }

  /* ── Standard card ──────────────────────────────────── */
  return (
    <div className="relative bg-white border border-gray-200 rounded-xl p-5 transition-all duration-200 hover:scale-[1.02] hover:border-gray-400 hover:shadow-lg">
      {isNew && (
        <span className="absolute -top-2 -right-2 bg-[#FF69B4] text-white text-[10px] font-bold px-2 py-0.5 rounded-full z-10">
          {t("new")}
        </span>
      )}
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-full bg-transparent border border-gray-200 overflow-hidden shrink-0 flex items-center justify-center">
          {project.logo ? (
            <img src={project.logo} alt={project.name} className="w-full h-full object-cover" />
          ) : (
            <span className="text-lg font-bold text-muted-foreground">{project.name.charAt(0)}</span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-base text-foreground truncate">{project.name}</h3>
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
            {project.tagline || "No description provided."}
          </p>
        </div>
      </div>
      <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground truncate flex-1">
          {project.latestPostTitle || <span className="italic">{t("noLatest")}</span>}
        </p>
        <Link
          href={`/project/${project.id}`}
          className="shrink-0 px-4 py-1.5 rounded-full bg-[#FF69B4] text-white text-xs font-semibold hover:bg-[#ff4fa8] transition-colors"
        >
          {t("view")}
        </Link>
      </div>
    </div>
  );
}
