// ====================== web3release-apis.js ======================

const Web3ReleaseAPI = {

  async getIDO() {
    try {
      const res = await fetch('/api/feeds/ido');
      const data = await res.json();
      const arr = Array.isArray(data) ? data : (data.tokens || []);
      return arr.slice(0, 12);
    } catch (e) { console.error('IDO fetch error', e); return []; }
  },

  async getGrants() {
    try {
      const res = await fetch('https://gapapi.karmahq.xyz/v2/communities');
      const comms = await res.json();
      let all = [];
      for (let c of comms.slice(0, 6)) {
        if (!c.slug) continue;
        const gRes = await fetch(`https://gapapi.karmahq.xyz/v2/communities/${c.slug}/grants`);
        const grants = await gRes.json();
        all = all.concat(grants.slice(0, 4).map(item => ({ ...item, community: c.name })));
      }
      return all;
    } catch (e) { return []; }
  },

  async getPolicyNews() {
    try {
      const res = await fetch('https://cryptocurrency.cv/api/news?limit=10&category=regulation');
      return await res.json() || [];
    } catch (e) { return []; }
  },

  async getAirdrops() {
    try {
      const res = await fetch('https://api.defillama.com/v2/airdrops');
      return await res.json() || [];
    } catch (e) { return []; }
  },

  getTestnets() {
    return [
      { name: "Ethereum Sepolia", url: "https://sepoliafaucet.com" },
      { name: "Solana Devnet", url: "https://faucet.solana.com" },
      { name: "Base Sepolia", url: "https://base-sepolia-faucet.com" },
      { name: "Arbitrum Sepolia", url: "https://faucet.arbitrum.io" },
    ];
  },

  async refreshAll() {
    const data = {
      ido: await this.getIDO(),
      grants: await this.getGrants(),
      policy: await this.getPolicyNews(),
      airdrops: await this.getAirdrops(),
      testnets: this.getTestnets()
    };
    return data;
  }
};

window.Web3ReleaseAPI = Web3ReleaseAPI;

setInterval(() => Web3ReleaseAPI.refreshAll(), 300000);
window.addEventListener('load', () => Web3ReleaseAPI.refreshAll());
