import { useState, type ReactNode } from "react";
import { useWeb3Auth } from "@/lib/web3";
import { isAdmin } from "@/lib/admin";
import { cn } from "@/lib/utils";

const SLOT_COUNT = 50;
const SLOT_W = 576;   // 3× 192px
const SLOT_H = 270;   // 3× 90px
const GAP = 8;        // px between slots

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
        "flex items-center justify-center text-base font-bold border-2 rounded-lg transition-all cursor-pointer select-none",
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
      className="flex flex-col shrink-0"
      style={{ width: SLOT_W, gap: GAP }}
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

export function AdminAdSlots({ children }: AdminAdSlotsProps) {
  const { address } = useWeb3Auth();
  const [leftSel, setLeftSel] = useState<number | null>(null);
  const [rightSel, setRightSel] = useState<number | null>(null);

  if (!isAdmin(address)) {
    return <>{children}</>;
  }

  return (
    <div className="flex items-start gap-2">
      {/* Left ad column — hidden below xl */}
      <div className="hidden xl:block shrink-0" style={{ width: SLOT_W }}>
        <SlotColumn
          side="left"
          selected={leftSel}
          onSelect={(n) => setLeftSel(n < 0 ? null : n)}
        />
      </div>

      {/* Main content */}
      <div className="flex-1 min-w-0">
        {children}
      </div>

      {/* Right ad column — hidden below xl */}
      <div className="hidden xl:block shrink-0" style={{ width: SLOT_W }}>
        <SlotColumn
          side="right"
          selected={rightSel}
          onSelect={(n) => setRightSel(n < 0 ? null : n)}
        />
      </div>
    </div>
  );
}
