import { useState } from "react";
import { useWeb3Auth } from "@/lib/web3";
import { isAdmin } from "@/lib/admin";
import { cn } from "@/lib/utils";

const SLOT_COUNT = 50;
const SLOT_W = 192;   // px — both sides identical
const SLOT_H = 90;    // px — both sides identical
const TOP_OFFSET = 116; // px — clear the two-row navbar

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
      style={{ width: SLOT_W, height: SLOT_H, flexShrink: 0 }}
      className={cn(
        "flex items-center justify-center text-sm font-bold border-2 rounded transition-all cursor-pointer select-none",
        selected
          ? "bg-blue-50 border-blue-500 text-blue-700 shadow"
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
      className={cn(
        "fixed z-40 hidden xl:flex flex-col gap-2 overflow-y-auto",
        side === "left" ? "left-0" : "right-0"
      )}
      style={{
        top: TOP_OFFSET,
        width: SLOT_W,
        maxHeight: `calc(100vh - ${TOP_OFFSET}px)`,
        paddingBottom: 8,
        scrollbarWidth: "none",
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
