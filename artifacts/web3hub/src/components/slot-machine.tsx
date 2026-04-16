import { useState, useRef, useEffect } from "react";
import { useLang } from "@/lib/i18n";

function useAudio() {
  const ctx = useRef<AudioContext | null>(null);
  function getCtx(): AudioContext {
    if (!ctx.current) ctx.current = new AudioContext();
    return ctx.current!;
  }
  function playTick() {
    try {
      const ac = getCtx();
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.connect(gain); gain.connect(ac.destination);
      osc.frequency.value = 400 + Math.random() * 200;
      gain.gain.setValueAtTime(0.04, ac.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.05);
      osc.start(); osc.stop(ac.currentTime + 0.05);
    } catch {}
  }
  function playWin(amount: number) {
    try {
      const ac = getCtx();
      const freqs = amount >= 701 ? [523, 659, 784, 1047] : amount >= 301 ? [392, 523, 659] : [330, 440];
      freqs.forEach((freq, i) => {
        const osc = ac.createOscillator();
        const gain = ac.createGain();
        osc.connect(gain); gain.connect(ac.destination);
        osc.frequency.value = freq; osc.type = "sine";
        const t = ac.currentTime + i * 0.12;
        gain.gain.setValueAtTime(0.12, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
        osc.start(t); osc.stop(t + 0.35);
      });
    } catch {}
  }
  return { playTick, playWin };
}

// Single digit reel
function DigitReel({ spinning, finalDigit, delay, speed }: {
  spinning: boolean;
  finalDigit: number;
  delay: number;
  speed: number; // ms per tick
}) {
  const [current, setCurrent] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (spinning) {
      const start = setTimeout(() => {
        intervalRef.current = setInterval(() => {
          setCurrent(d => (d + 1) % 10);
        }, speed);
      }, delay);
      return () => clearTimeout(start);
    } else {
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
      setCurrent(finalDigit);
    }
  }, [spinning, finalDigit, delay, speed]);

  return (
    <div style={{
      width: 56, height: 72,
      background: "rgba(255,255,255,0.06)",
      border: "1.5px solid rgba(255,255,255,0.12)",
      borderRadius: 10,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: 36, fontWeight: 800,
      fontVariantNumeric: "tabular-nums",
      color: spinning ? "#a78bfa" : "#fbbf24",
      transition: spinning ? "none" : "color 0.4s",
      letterSpacing: 0,
      fontFamily: "monospace",
    }}>
      {current}
    </div>
  );
}

interface SlotMachineProps {
  wallet: string;
  tokens: number;
  lastSlotPull: string | null;
  onSuccess: (newTokens: number, earned: number) => void;
}

const SPIN_DURATION = 5000; // 5 seconds

export function SlotMachine({ wallet, tokens, lastSlotPull, onSuccess }: SlotMachineProps) {
  const { t } = useLang();
  const { playTick, playWin } = useAudio();

  // Local token state so display updates immediately after winning,
  // without waiting for the parent query to refetch
  const [localTokens, setLocalTokens] = useState(tokens);
  useEffect(() => { setLocalTokens(tokens); }, [tokens]);

  const [spinning, setSpinning] = useState(false);
  const [countdown, setCountdown] = useState(5);
  const [result, setResult] = useState<{ earned: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  // 4 digits representing the prize, e.g. 131 → [0,1,3,1]
  const [finalDigits, setFinalDigits] = useState([0, 0, 0, 0]);
  // reel speeds (fast early, slow near end)
  const [reelSpeed, setReelSpeed] = useState(60);

  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const canPull = !lastSlotPull || Date.now() - new Date(lastSlotPull).getTime() >= 24 * 60 * 60 * 1000;

  let nextPullStr = "";
  if (!canPull && lastSlotPull) {
    const next = new Date(new Date(lastSlotPull).getTime() + 24 * 60 * 60 * 1000);
    const diff = next.getTime() - Date.now();
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    nextPullStr = `${h}h ${m}m`;
  }

  function stopAll() {
    if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; }
    if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null; }
  }

  async function handlePull() {
    if (spinning || !canPull) return;
    setSpinning(true);
    setResult(null);
    setError(null);
    setCountdown(5);
    setReelSpeed(60);

    // Start sound ticks
    tickRef.current = setInterval(() => playTick(), 100);

    // Countdown timer
    let cd = 5;
    countdownRef.current = setInterval(() => {
      cd -= 1;
      setCountdown(cd);
      // Slow down reels near end
      if (cd === 2) setReelSpeed(120);
      if (cd === 1) setReelSpeed(220);
      if (cd <= 0) {
        if (countdownRef.current) clearInterval(countdownRef.current);
      }
    }, 1000);

    try {
      const API = import.meta.env.BASE_URL.replace(/\/$/, "").replace(/\/web3hub$/, "") + "/api";
      const res = await fetch(`${API}/users/slot-pull`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet }),
      });
      const data = await res.json();

      if (!data.success) {
        stopAll();
        setSpinning(false);
        setError(data.message || t("slotCooldown"));
        return;
      }

      const earned: number = data.earned;
      // Pad to 4 digits
      const digits = String(earned).padStart(4, "0").split("").map(Number);
      setFinalDigits(digits);

      // Wait for 5s total spin then stop
      setTimeout(() => {
        stopAll();
        setSpinning(false);
        setResult({ earned });
        playWin(earned);
        setLocalTokens(data.tokens);   // update immediately, don't wait for parent refetch
        onSuccess(data.tokens, earned);
      }, SPIN_DURATION);

    } catch {
      stopAll();
      setSpinning(false);
      setError("Network error");
    }
  }

  const isDone = !canPull && !spinning;

  return (
    <div style={{
      background: "rgba(255,255,255,0.04)",
      border: "1px solid rgba(255,255,255,0.1)",
      borderRadius: 14,
      padding: "16px 20px",
      marginBottom: 12,
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 14, color: "var(--foreground)" }}>{t("slotTitle")}</div>
          <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 2 }}>{t("slotDesc")}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 11, color: "var(--muted-foreground)" }}>{t("tokenLabel")}</div>
          <div style={{ fontWeight: 700, fontSize: 20, color: "#f59e0b", lineHeight: 1.2 }}>{localTokens.toLocaleString()}</div>
          <div style={{ fontSize: 10, color: "rgba(245,158,11,0.6)" }}>$WBR</div>
        </div>
      </div>

      {/* Number reels — shown only when spinning or not yet pulled */}
      {(!isDone || spinning) && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", gap: 8, justifyContent: "center", alignItems: "center" }}>
            <DigitReel spinning={spinning} finalDigit={finalDigits[0]} delay={0} speed={reelSpeed} />
            <DigitReel spinning={spinning} finalDigit={finalDigits[1]} delay={80} speed={reelSpeed} />
            <DigitReel spinning={spinning} finalDigit={finalDigits[2]} delay={160} speed={reelSpeed} />
            <DigitReel spinning={spinning} finalDigit={finalDigits[3]} delay={240} speed={reelSpeed} />
          </div>
          {spinning && (
            <div style={{ textAlign: "center", marginTop: 10, fontSize: 13, color: "#a78bfa", fontWeight: 600 }}>
              {countdown}s
            </div>
          )}
        </div>
      )}

      {/* Result */}
      {result && (
        <div style={{
          textAlign: "center", marginBottom: 12, padding: "8px 14px",
          background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.25)",
          borderRadius: 8, color: "#f59e0b", fontWeight: 600, fontSize: 14,
        }}>
          {t("slotResult").replace("{amount}", result.earned.toLocaleString())}
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{
          textAlign: "center", marginBottom: 12, padding: "7px 14px",
          background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)",
          borderRadius: 8, color: "#f87171", fontSize: 12,
        }}>
          {error}
        </div>
      )}

      {/* Pull button */}
      {!isDone && (
        <button
          onClick={handlePull}
          disabled={spinning}
          style={{
            width: "100%", padding: "10px 0", borderRadius: 9, border: "none",
            background: spinning ? "rgba(255,255,255,0.06)" : "rgba(124,58,237,0.7)",
            color: spinning ? "rgba(255,255,255,0.4)" : "#fff",
            fontWeight: 600, fontSize: 14,
            cursor: spinning ? "not-allowed" : "pointer",
            transition: "all 0.2s",
          }}
        >
          {spinning ? t("slotPulling") : t("slotPull")}
        </button>
      )}

      {/* Cooldown */}
      {isDone && (
        <div style={{ fontSize: 12, color: "var(--muted-foreground)", textAlign: "center" }}>
          <span>{t("slotCooldown")}</span>
          {nextPullStr && (
            <span style={{ marginLeft: 8 }}>
              · {t("slotNextPull").replace("{time}", nextPullStr)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
