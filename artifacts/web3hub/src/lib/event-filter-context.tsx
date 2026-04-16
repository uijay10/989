import { createContext, useContext, useState, type ReactNode } from "react";

export const NAV_KEY_TO_CATEGORY: Record<string, string> = {
  nav_testnet:   "测试网",
  nav_ido:       "IDO/Launchpad",
  nav_funding:   "融资公告",
  nav_policy:    "政策监管",
  nav_recruiting:"招聘",
  nav_nodes:     "节点招募",
  nav_quest:     "链上奖励/空投",
  nav_devbounty: "开发者漏洞奖金",
  nav_grant:     "项目捐赠/赞助",
};

interface EventFilterCtx {
  activeCategory: string;
  setActiveCategory: (c: string) => void;
}

const EventFilterContext = createContext<EventFilterCtx>({
  activeCategory: "全部",
  setActiveCategory: () => {},
});

export function EventFilterProvider({ children }: { children: ReactNode }) {
  const [activeCategory, setActiveCategory] = useState("全部");
  return (
    <EventFilterContext.Provider value={{ activeCategory, setActiveCategory }}>
      {children}
    </EventFilterContext.Provider>
  );
}

export function useEventFilter() {
  return useContext(EventFilterContext);
}
