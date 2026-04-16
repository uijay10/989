import { useLang } from "@/lib/i18n";

interface RoleBadgeProps {
  spaceType?: string | null;
  size?: "xs" | "sm";
}

export function RoleBadge({ spaceType, size = "xs" }: RoleBadgeProps) {
  const { t } = useLang();
  const base = size === "xs"
    ? "text-[10px] font-bold px-1.5 py-0.5 rounded-full whitespace-nowrap"
    : "text-xs font-bold px-2 py-0.5 rounded-full whitespace-nowrap";

  if (spaceType === "project") {
    return <span className={`${base} bg-pink-100 text-pink-600 dark:bg-pink-900/30 dark:text-pink-300`}>{t("roleProject")}</span>;
  }
  if (spaceType === "kol") {
    return <span className={`${base} bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-300`}>KOL</span>;
  }
  if (spaceType === "developer") {
    return <span className={`${base} bg-yellow-100 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-300`}>{t("roleDeveloper")}</span>;
  }
  if (!spaceType) return null;
  return <span className={`${base} bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-300`}>{t("roleMember")}</span>;
}
