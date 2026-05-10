import adImage from "@assets/a797492f-06e1-4a90-8060-124ce156c319_1778420888866.png";

export default function PromoAd() {
  return (
    <a
      href="https://www.hifastvpn.com/"
      target="_blank"
      rel="noreferrer"
      className="block overflow-hidden rounded-2xl border border-red-200 bg-white shadow-sm hover:shadow-md transition-shadow"
    >
      <div className="flex items-center gap-4 p-4">
        <img
          src={adImage}
          alt="Hi快VPN"
          className="h-16 w-16 rounded-xl object-cover shrink-0"
        />
        <div className="min-w-0">
          <p className="text-base font-bold text-slate-900 leading-snug">
            Hi快VPN专业级加密和超高速全球连接，保护您所有设备的隐私安全
          </p>
        </div>
      </div>
    </a>
  );
}