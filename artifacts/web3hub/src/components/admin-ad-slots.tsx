import { useState } from "react";
import { useWeb3Auth } from "@/lib/web3";
import { isAdmin } from "@/lib/admin";
import { cn } from "@/lib/utils";

const SLOT_COUNT = 50;

interface SlotProps {
  num: number;
  side: "left" | "right";
  selected: boolean;
  onSelect: () => void;
}

function AdSlot({ num, side, selected, onSelect }: SlotProps) {
  return (
    <button
      type="button"
      title={`${side === "left" ? "左侧" : "右侧"}广告位 #${num}`}
      onClick={onSelect}
      className={cn(
        "w-full aspect-square flex items-center justify-center text-[10px] font-bold border rounded transition-all cursor-pointer select-none",
        selected
          ? "bg-blue-100 border-blue-400 text-blue-700 shadow-sm"
          : "bg-white/70 border-slate-200 text-slate-400 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-600"
      )}
    >
      {num}
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
        "fixed top-36 z-30 hidden xl:flex flex-col gap-1.5 p-2 rounded-xl",
        "bg-white/60 backdrop-blur-sm border border-slate-200/70 shadow-sm",
        side === "left" ? "left-1" : "right-1"
      )}
      style={{ width: 164 }}
    >
      <p className="text-[9px] font-bold text-slate-400 text-center uppercase tracking-widest">
        {side === "left" ? "左侧广告位" : "右侧广告位"}
      </p>
      <div className="grid grid-cols-5 gap-0.5">
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
      {selected !== null && selected > 0 && (
        <p className="text-[9px] text-blue-600 font-semibold text-center">
          已选：{side === "left" ? "左" : "右"}侧 #{selected}
        </p>
      )}
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
