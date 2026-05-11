import { useState, type ReactNode } from "react";
import { useWeb3Auth } from "@/lib/web3";
import { isAdmin } from "@/lib/admin";
import { cn } from "@/lib/utils";

const SLOT_COUNT = 50;
const SLOT_H = 150;
const GAP = 8;

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
      style={{ height: SLOT_H, width: "100%", flexShrink: 0 }}
      className={cn(
        "flex items-center justify-center text-sm font-bold border-2 rounded-lg transition-all cursor-pointer select-none",
        selected
          ? "bg-blue-50 border-blue-500 text-blue-700 shadow-md"
          : "bg-white/80 border-slate-300 text-slate-500 hover:bg-blue-50 hover:border-blue-400 hover:text-blue-600"
      )}
    >
      {label}
    </button>
  );
}

interface SlotColumnProps {
  side: "left" | "right";
  selected: number | null;
  onSelect: (n: number) => void;
}

function SlotColumn({ side, selected, onSelect }: SlotColumnProps) {
  return (
    <div
      className="flex flex-col w-full"
      style={{ gap: GAP }}
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

interface AdminAdSlotsProps {
  children: ReactNode;
}

/**
 * Wraps page content in a 3-column layout when admin is connected.
 * Left/right columns fill the margin space outside max-w-7xl (80rem).
 * All three columns scroll together with the page.
 * Non-admin users see children rendered normally.
 */
export function AdminAdSlots({ children }: AdminAdSlotsProps) {
  const { address } = useWeb3Auth();
  const [leftSel, setLeftSel] = useState<number | null>(null);
  const [rightSel, setRightSel] = useState<number | null>(null);

  if (!isAdmin(address)) {
    return <>{children}</>;
  }

  // Side column width = the margin on each side of the max-w-7xl (80rem) container
  const colWidth = "calc((100vw - 80rem) / 2)";

  return (
    <div className="flex items-start w-full">
      {/* Left ad column — fills left margin, scrolls with page */}
      <div style={{ width: colWidth, minWidth: 0, flexShrink: 0 }}>
        <SlotColumn
          side="left"
          selected={leftSel}
          onSelect={(n) => setLeftSel(n < 0 ? null : n)}
        />
      </div>

      {/* Main content */}
      {children}

      {/* Right ad column */}
      <div style={{ width: colWidth, minWidth: 0, flexShrink: 0 }}>
        <SlotColumn
          side="right"
          selected={rightSel}
          onSelect={(n) => setRightSel(n < 0 ? null : n)}
        />
      </div>
    </div>
  );
}
