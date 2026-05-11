import { useState } from "react";
import { useWeb3Auth } from "@/lib/web3";
import { isAdmin } from "@/lib/admin";
import { cn } from "@/lib/utils";

const SLOT_COUNT = 50;
const SLOT_H = 150;   // px — height of each slot
const GAP = 8;        // px — gap between slots
// navbar height: ~116px (two rows)
const TOP = 116;

interface AdSlotProps {
  num: number;
  side: "left" | "right";
  selected: boolean;
  onSelect: () => void;
}

function AdSlot({ num, side, selected, onSelect }: AdSlotProps) {
  const label = side === "left" ? `左${num}` : `右${num}`;
  return (
    <button
      type="button"
      title={label}
      onClick={onSelect}
      style={{ height: SLOT_H, width: "100%" }}
      className={cn(
        "flex items-center justify-center text-sm font-bold border-2 rounded-lg transition-all cursor-pointer select-none shrink-0",
        selected
          ? "bg-blue-50 border-blue-500 text-blue-700 shadow-md"
          : "bg-white/80 border-slate-300 text-slate-500 hover:bg-blue-50 hover:border-blue-400 hover:text-blue-600"
      )}
    >
      {label}
    </button>
  );
}

interface SidePanelProps {
  side: "left" | "right";
  selected: number | null;
  onSelect: (n: number) => void;
}

function SidePanel({ side, selected, onSelect }: SidePanelProps) {
  return (
    <div
      style={{
        position: "fixed",
        top: TOP,
        // fill the margin between browser edge and the 1280px (80rem) content box
        [side === "left" ? "left" : "right"]: 0,
        width: "calc((100vw - 80rem) / 2 - 4px)",
        height: `calc(100vh - ${TOP}px)`,
        overflowY: "auto",
        scrollbarWidth: "none",
        display: "flex",
        flexDirection: "column",
        gap: GAP,
        paddingBottom: GAP,
        zIndex: 30,
      }}
    >
      {Array.from({ length: SLOT_COUNT }, (_, i) => {
        const num = i + 1;
        return (
          <AdSlot
            key={num}
            num={num}
            side={side}
            selected={selected === num}
            onSelect={() => onSelect(selected === num ? -1 : num)}
          />
        );
      })}
    </div>
  );
}

export function AdminAdSlots() {
  const { address } = useWeb3Auth();
  const [leftSel, setLeftSel] = useState<number | null>(null);
  const [rightSel, setRightSel] = useState<number | null>(null);

  if (!isAdmin(address)) return null;

  return (
    <>
      <SidePanel
        side="left"
        selected={leftSel}
        onSelect={(n) => setLeftSel(n < 0 ? null : n)}
      />
      <SidePanel
        side="right"
        selected={rightSel}
        onSelect={(n) => setRightSel(n < 0 ? null : n)}
      />
    </>
  );
}
