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
  activeChain: string | null;
  setActiveChain: (c: string | null) => void;
  activeExchange: string | null;
  setActiveExchange: (e: string | null) => void;
  clearEcosystem: () => void;
}

const EventFilterContext = createContext<EventFilterCtx>({
  activeCategory: "全部",
  setActiveCategory: () => {},
  activeChain: null,
  setActiveChain: () => {},
  activeExchange: null,
  setActiveExchange: () => {},
  clearEcosystem: () => {},
});

export function EventFilterProvider({ children }: { children: ReactNode }) {
  const [activeCategory, setActiveCategory] = useState("全部");
  const [activeChain, setActiveChain] = useState<string | null>(null);
  const [activeExchange, setActiveExchange] = useState<string | null>(null);
  const clearEcosystem = () => {
    setActiveChain(null);
    setActiveExchange(null);
  };
  return (
    <EventFilterContext.Provider
      value={{
        activeCategory,
        setActiveCategory,
        activeChain,
        setActiveChain,
        activeExchange,
        setActiveExchange,
        clearEcosystem,
      }}
    >
      {children}
    </EventFilterContext.Provider>
  );
}

export function useEventFilter() {
  return useContext(EventFilterContext);
}
