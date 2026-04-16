import { useState, useEffect } from "react";
import { useConnect } from "wagmi";
import { injected } from "wagmi/connectors";
import { useWeb3Modal } from "@web3modal/wagmi/react";
import { X, ExternalLink } from "lucide-react";
import { useLang } from "@/lib/i18n";

interface WalletConfig {
  key: string;
  name: string;
  color: string;
  logoUrl: string;
  detect: () => boolean;
  installUrl: string;
}

const WALLETS: WalletConfig[] = [
  {
    key: "metamask",
    name: "MetaMask",
    color: "#F6851B",
    logoUrl: "https://www.google.com/s2/favicons?domain=metamask.io&sz=128",
    detect: () =>
      typeof window !== "undefined" &&
      !!(window as any).ethereum?.isMetaMask &&
      !(window as any).ethereum?.isRabby &&
      !(window as any).ethereum?.isBraveWallet,
    installUrl: "https://metamask.io/download/",
  },
  {
    key: "trust",
    name: "Trust Wallet",
    color: "#3375BB",
    logoUrl: "https://www.google.com/s2/favicons?domain=trustwallet.com&sz=128",
    detect: () =>
      typeof window !== "undefined" &&
      (!!(window as any).ethereum?.isTrust || !!(window as any).trustwallet),
    installUrl: "https://trustwallet.com/download",
  },
  {
    key: "phantom",
    name: "Phantom",
    color: "#AB9FF2",
    logoUrl: "https://www.google.com/s2/favicons?domain=phantom.app&sz=128",
    detect: () =>
      typeof window !== "undefined" &&
      (!!(window as any).phantom?.ethereum || !!(window as any).ethereum?.isPhantom),
    installUrl: "https://phantom.app/download",
  },
  {
    key: "okx",
    name: "OKX Wallet",
    color: "#000000",
    logoUrl: "https://www.google.com/s2/favicons?domain=okx.com&sz=128",
    detect: () =>
      typeof window !== "undefined" &&
      (!!(window as any).okxwallet || !!(window as any).ethereum?.isOKExWallet),
    installUrl: "https://www.okx.com/web3",
  },
  {
    key: "coinbase",
    name: "Coinbase Wallet",
    color: "#0052FF",
    logoUrl: "https://www.google.com/s2/favicons?domain=coinbase.com&sz=128",
    detect: () =>
      typeof window !== "undefined" &&
      (!!(window as any).ethereum?.isCoinbaseWallet ||
        !!(window as any).coinbaseWalletExtension),
    installUrl: "https://www.coinbase.com/wallet/downloads",
  },
  {
    key: "rabby",
    name: "Rabby Wallet",
    color: "#7084FF",
    logoUrl: "https://www.google.com/s2/favicons?domain=rabby.io&sz=128",
    detect: () =>
      typeof window !== "undefined" && !!(window as any).ethereum?.isRabby,
    installUrl: "https://rabby.io",
  },
];

function WalletLogo({ wallet, size = 40 }: { wallet: WalletConfig; size?: number }) {
  const [imgError, setImgError] = useState(false);
  return imgError ? (
    <div
      className="rounded-xl flex items-center justify-center text-white font-bold text-base flex-shrink-0"
      style={{ width: size, height: size, background: wallet.color }}
    >
      {wallet.name[0]}
    </div>
  ) : (
    <div
      className="rounded-xl overflow-hidden flex-shrink-0 flex items-center justify-center bg-gray-100 dark:bg-white/8"
      style={{ width: size, height: size }}
    >
      <img
        src={wallet.logoUrl}
        alt={wallet.name}
        className="w-full h-full object-contain"
        onError={() => setImgError(true)}
      />
    </div>
  );
}

function WalletConnectLogo({ size = 40 }: { size?: number }) {
  return (
    <div
      className="rounded-xl flex items-center justify-center flex-shrink-0"
      style={{ width: size, height: size, background: "#3396FF" }}
    >
      <svg width={size * 0.58} height={size * 0.38} viewBox="0 0 40 25" fill="none">
        <path
          d="M8.19 4.94c6.52-6.59 17.1-6.59 23.62 0l.79.79a.81.81 0 0 1 0 1.17l-2.68 2.71a.43.43 0 0 1-.6 0l-1.08-1.09c-4.55-4.59-11.93-4.59-16.48 0l-1.16 1.17a.43.43 0 0 1-.6 0L7.32 6.98a.81.81 0 0 1 0-1.17l.87-.87zm29.18 5.6 2.39 2.41a.81.81 0 0 1 0 1.17L27.42 26.04a.85.85 0 0 1-1.2 0l-8.43-8.51a.21.21 0 0 0-.3 0L9.06 26.04a.85.85 0 0 1-1.2 0L.41 18.49a.81.81 0 0 1 0-1.17l2.39-2.41a.85.85 0 0 1 1.2 0l8.43 8.51c.08.08.22.08.3 0l8.43-8.51a.85.85 0 0 1 1.2 0l8.43 8.51c.08.08.22.08.3 0l8.43-8.51a.85.85 0 0 1 1.2 0z"
          fill="white"
        />
      </svg>
    </div>
  );
}

interface WalletPickerModalProps {
  open: boolean;
  onClose: () => void;
}

export function WalletPickerModal({ open, onClose }: WalletPickerModalProps) {
  const { connect } = useConnect();
  const { open: openW3M } = useWeb3Modal();
  const { lang } = useLang();
  const isZh = lang === "zh-CN";

  const [walletStates, setWalletStates] = useState<Record<string, boolean>>({});
  const [notInstalledKey, setNotInstalledKey] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setNotInstalledKey(null);
      const states: Record<string, boolean> = {};
      for (const w of WALLETS) {
        try { states[w.key] = w.detect(); } catch { states[w.key] = false; }
      }
      setWalletStates(states);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const handleConnect = () => {
    try { connect({ connector: injected() }); } catch { /* wagmi surfaces errors */ }
    onClose();
  };

  const handleWalletClick = (wallet: WalletConfig) => {
    if (walletStates[wallet.key]) {
      handleConnect();
    } else {
      setNotInstalledKey(notInstalledKey === wallet.key ? null : wallet.key);
    }
  };

  const handleWalletConnect = () => {
    onClose();
    setTimeout(() => openW3M(), 100);
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-sm bg-white dark:bg-[#141414] rounded-3xl shadow-2xl overflow-hidden border border-gray-100 dark:border-white/5">

        {/* Header */}
        <div className="flex items-center px-5 pt-5 pb-4">
          <div className="w-8 h-8 flex items-center justify-center">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" className="text-gray-400" />
              <path d="M12 8v4m0 4h.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="text-gray-400" />
            </svg>
          </div>
          <h2 className="flex-1 text-center text-base font-semibold text-gray-900 dark:text-white">
            {isZh ? "连接钱包" : "Connect Wallet"}
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-gray-100 dark:hover:bg-white/5 transition-colors"
          >
            <X className="w-4 h-4 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        <div className="h-px bg-gray-100 dark:bg-white/5" />

        {/* Wallet list */}
        <div className="py-2">

          {/* WalletConnect */}
          <button
            onClick={handleWalletConnect}
            className="w-full flex items-center gap-3 px-5 py-3 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors text-left"
          >
            <WalletConnectLogo />
            <span className="flex-1 text-sm font-medium text-gray-800 dark:text-gray-200">
              WalletConnect
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded font-bold border border-[#3396FF] text-[#3396FF] tracking-wide">
              QR CODE
            </span>
          </button>

          {/* MetaMask + 5 wallets */}
          {WALLETS.map((wallet) => (
            <div key={wallet.key}>
              <button
                onClick={() => handleWalletClick(wallet)}
                className="w-full flex items-center gap-3 px-5 py-3 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors text-left"
              >
                <WalletLogo wallet={wallet} />
                <span className="flex-1 text-sm font-medium text-gray-800 dark:text-gray-200">
                  {wallet.name}
                </span>
                {walletStates[wallet.key] && (
                  <span className="text-[10px] px-2 py-0.5 rounded font-bold bg-[#3396FF] text-white tracking-wide">
                    {isZh ? "已安装" : "INSTALLED"}
                  </span>
                )}
              </button>

              {notInstalledKey === wallet.key && (
                <div className="mx-5 mb-2 px-3 py-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/40 flex items-center justify-between gap-2">
                  <p className="text-xs text-amber-700 dark:text-amber-400 font-medium">
                    {isZh ? "请先安装该钱包" : "Please install this wallet first"}
                  </p>
                  <a
                    href={wallet.installUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="flex items-center gap-1 text-xs font-semibold text-amber-800 dark:text-amber-300 hover:underline flex-shrink-0"
                  >
                    {isZh ? "去安装" : "Install"}
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
