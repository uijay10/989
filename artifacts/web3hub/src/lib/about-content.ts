export type AboutSection = {
  heading: string;
  intro?: string;
  items?: string[];
  subsections?: { heading: string; intro?: string; items?: string[] }[];
};

export type AboutContent = {
  title: string;
  subtitle: string;
  coreConcept: string;
  sections: AboutSection[];
};

export const ABOUT_CONTENT: Record<string, AboutContent> = {
  "zh-CN": {
    title: "关于平台",
    subtitle:
      "Web3 Release 是一个去中心化、社区驱动的 Web3 协作平台，定位为「加密团队一站式需求发布与匹配中心」。通过钱包连接实现真实身份验证，帮助加密团队、KOL 和开发者和加密用户的高效连接，发布需求、匹配人才、分享知识和社区互动。本平台仅作为去中心化信息桥梁。平台不参与任何匹配、聊天、交付或支付。用户发布需求后，请在内容中留下有效联系方式。感兴趣的用户可直接私信联系，双方自行协商一切事宜，平台不承担任何责任或纠纷调解。",
    coreConcept:
      "核心理念：连接需求，释放创新。加密团队可以随时发布各种需求，区块链用户（开发者、KOL、节点运营者等）可以快速发现并响应，实现透明、高效的协作。",
    sections: [
      {
        heading: "当前主要功能展示",
        items: [
          "Pinned Zone：置顶区，展示高优先级或热门需求（带倒计时，如 1 天剩余）。",
          "Elite Teams：精英团队/项目列表，按最新排序展示，支持不同视图（Testnet View、Jobs View、Integration View 等）。",
          "发布与匹配：团队发布需求后，内容以时间线形式出现在首页「项目展示」区和对应专栏，最新内容优先置顶。",
          "操作入口：Connect Wallet（连接钱包 🌙）、Join Guild / Join Now（申请加入，火箭 🚀）。",
        ],
      },
      {
        heading: "代币激励系统（核心激励机制）",
        intro:
          "平台内置代币获取与增长机制，用于奖励高质量内容创作、真实互动和社区参与。代币总量无限，是未来 $WBR 代币空投/兑换的重要凭证（TGE 时所有累积代币 1:1 兑换为正式代币，越活跃、贡献越大，持有份额越高）。",
        subsections: [
          {
            heading: "平台代币分配与空投计划",
            intro:
              "平台正式代币 $WBR 的 60% 将定期分批次通过空投形式发放，用于激励平台活跃用户、内容贡献者和社区增长，实现真正的去中心化治理与价值分配。空投将基于用户在平台上的真实贡献（如抽奖、互动、邀请、内容发布等累积代币）进行加权分配，确保代币向社区倾斜，促进长期可持续发展和去中心化。",
            items: [
              "⚠️ 重要提示：每期空投仅限前排名 3万名 用户参与。",
              "排名依据用户真实贡献，内容发布质量、有效互动、邀请。",
              "本期进入前3万名的用户：空投发放后，显示数量自动清零，重新开始下一周期积累。",
              "本期未进入前3万名的用户：全部自动累计至下一批次，继续参与下一次排名。",
              "越早注册、持续活跃、贡献越大，获得份额越高。",
            ],
          },
          {
            heading: "全部用户均可获取代币的方式",
            items: [
              "每日代币抽奖：每 24 小时可抽取一次；奖励范围及概率：100–300 代币（50%）、301–700 代币（30%）、701–1000 代币（20%）；所有抽奖所得实时累加至余额。",
              "邀请奖励：通过专属邀请链接/码成功邀请新用户并激活后，建立永久绑定。邀请者每日自动获得被邀请者当日实际获取代币总量的 15% 作为奖励，无上限、实时结算。所有身份用户均可参与邀请奖励。",
            ],
          },
          {
            heading: "普通用户额外获取方式（点赞/评论任务）",
            items: [
              "点赞一次：+5 代币（每日上限 20 次有效）。",
              "评论一次：+5 代币（每日上限 20 次有效）。",
              "每日点赞 + 评论任务总上限：40 次，超出后当日不再产生任务代币奖励，防止刷量。",
            ],
          },
          {
            heading: "团队、KOL 及开发者额外获取方式（被互动奖励）",
            items: [
              "自己发布的帖子每获得 1 个点赞：+5 代币。",
              "自己发布的帖子每获得 1 条评论：+5 代币。",
              "每 24 小时通过被互动获得的代币上限：2000 代币，超出部分不予累积。",
              "注：团队/KOL/开发者不可通过主动点赞或评论他人帖子获取代币任务奖励。",
            ],
          },
        ],
      },
      {
        heading: "能量系统（内容发布与曝光燃料）",
        intro:
          "能量是内容发布和提升可见度的核心资源，目前通过申请身份赠送，未来由代币提供或兑换（代币作为内容消耗的凭据）。",
        items: [
          "申请身份通过后自动赠送 1000 能量（首次使用礼包）。",
          "每次内容消耗 1 能量（无论内容类型）。",
          "每日内容最多 10 次（即使能量充足，也受此上限限制，防止刷量和内容泛滥）。",
          "未来 $WBR 代币将作为内容消耗凭据：用户持有/赚取代币后可兑换能量，用于发布内容、置顶、Boost 等行为，形成平台经济闭环。",
        ],
        subsections: [
          {
            heading: "惩罚与衰减机制（激励活跃使用）",
            intro:
              "为鼓励用户持续参与、避免能量长期囤积，引入强激励的衰减惩罚规则：",
            items: [
              "每日衰减：如果用户在过去 48 小时内未发布任何内容，则当日 00:00（UTC）自动对当前能量总量衰减 5%（向下取整）。示例：当前能量 1000 → 48 小时未发布 → 扣除 50，剩余 950。",
              "连续未活跃清零：如果用户连续 7 天（168 小时）未发布任何内容，则在第 7 天结束时，能量余额自动清零至 0。清零后，用户仍可通过未来 $WBR 代币兑换或其他方式重新获取能量，但首次礼包不再重复赠送。",
              "目的：通过每48小时 5% 小额衰减 + 7 天清零的组合，形成持续且可预期的压力，鼓励用户至少每天或每周保持内容输出，形成健康、高活跃的内容生态。",
            ],
          },
        ],
      },
      {
        heading: "内容规则（完整版）",
        subsections: [
          {
            heading: "1. 身份申请与能量门槛",
            items: [
              "申请时选择身份类别标签（仅限以下三种，不可多选）：加密团队、KOL（关键意见领袖）、开发者。",
              "身份通过后自动赠送 1000 能量。",
              "每次内容消耗 1 能量（能量不足无法发布，需未来通过代币兑换补充）。",
              "每日内容上限：最多 10 次/天。",
            ],
          },
          {
            heading: "2. 内容标签与自动归集",
            items: [
              "KOL 和开发者身份：内容自动归集到选择分区内（垂直展示，便于团队筛选人才，不占用首页普通位）。",
              "标签决定内容在对应子栏目的展示位置，实现精准匹配。",
              "普通用户：每日发布内容限 10 次（只限求职和社区聊天分区）。",
              "每个分区系统只会显示最新发布的一条内容，后续发布将会自动覆盖上一次的内容。",
              "您可以使用代币按 200:1 的比例兑换能量，用于获取更多发布次数或能量值。",
            ],
          },
          {
            heading: "3. 内容审核与优先级",
            items: [
              "内容即时发布，无需人工审核（去中心化原则）。",
              "高能量用户可额外申请置顶/Boost（消耗更多能量，置顶时间更长、位置更高）。",
              "平台保留举报/下架机制（社区治理或管理员干预，用于处理明显诈骗/垃圾内容）。",
            ],
          },
        ],
      },
      {
        heading: "平台愿景与解决的问题",
        intro:
          "Web3 Release 致力于成为 Web3 时代的「Twitter + LinkedIn + Gitcoin」——一个真正去中心化、社区自驱动的协作与发布中心。在信任、可追溯、激励充分的环境中，让加密团队、KOL 和开发者自由发布与协作，加速区块链下一波真实创新。",
        subsections: [
          {
            heading: "主要解决的问题",
            items: [
              "协作摩擦高：需求与供给分散多平台，筛选成本极高。",
              "信任缺失：低质量邀约、诈骗泛滥，项目真实性难辨。",
              "机会不均：开发者/KOL 难以被看见，缺乏持续激励。",
              "信息碎片化：跨链信息重复建设、低质协作严重。",
              "中心化依赖：中小参与者曝光难，依赖算法或付费推广。",
            ],
          },
          {
            heading: "Web3 Release 的解法",
            items: [
              "身份类别申请 + 内容标签分类，大幅降低协作门槛。",
              "能量门槛（未来代币消耗）+ 每日内容上限 10 次，建立可验证信任。",
              "抽奖 + 互动（每日活动上限 40 次） + 邀请机制（15% 奖励），激励真实活跃与社区增长。",
              "平台代币 60% 定期分批空投 + 代币 1:1 兑换，奖励长期贡献，实现真正的去中心化。",
              "去中心化声誉体系，促进多链互联，赋能中小参与者，让区块链生态更健康、更高效发展。",
            ],
          },
        ],
      },
    ],
  },

  "en": {
    title: "About",
    subtitle:
      "Web3 Release is a decentralized, community-driven Web3 collaboration platform — the all-in-one demand publishing & matching platform for crypto teams. Using wallet-based identity verification, it efficiently connects crypto teams, KOLs, and developers to publish needs, match talent, share knowledge, and engage with the community.",
    coreConcept:
      "Core Concept: Connect demand, unleash innovation. Crypto teams can post any requirement at any time, and blockchain users (developers, KOLs, node operators, etc.) can quickly discover and respond, enabling transparent and efficient collaboration.",
    sections: [
      {
        heading: "Key Features",
        items: [
          "Pinned Zone: Highlights high-priority or trending posts with a live countdown.",
          "Elite Teams: Project list sorted by latest activity, with multiple view modes (Testnet, Jobs, Integration, etc.).",
          "Publish & Match: Posts appear in the homepage timeline and their corresponding section immediately after publishing.",
          "Entry Points: Connect Wallet 🌙, Join Guild / Join Now 🚀 (apply for a space).",
        ],
      },
      {
        heading: "Token Incentive System (Core Mechanism)",
        intro:
          "The platform has a built-in token earning system to reward quality content, genuine interactions, and community participation. Tokens are unlimited and serve as the key credential for the future $WBR token airdrop/exchange — all accumulated tokens convert 1:1 at TGE, so the more active you are, the higher your share.",
        subsections: [
          {
            heading: "Token Distribution & Airdrop Plan",
            intro:
              "60% of the official $WBR token supply will be distributed periodically via airdrops to reward active users, content contributors, and community growth. Airdrops are weighted by real contributions (slot pulls, interactions, referrals, posts), ensuring tokens flow to the community and support long-term decentralized growth.",
          },
          {
            heading: "Token Sources Available to All Users",
            items: [
              "Daily slot pull: once every 24 hours; prize range: 100–300 tokens (50%), 301–700 tokens (30%), 701–1,000 tokens (20%). All prizes credited to balance instantly.",
              "Referral bonus: After a successful invite, earn 15% of your invitee's daily token earnings automatically — no cap, settled in real time. All user types are eligible for referral rewards.",
            ],
          },
          {
            heading: "General Users — Additional Task Rewards (Likes & Comments)",
            items: [
              "Like a post: +5 tokens (up to 20 valid likes/day).",
              "Comment on a post: +5 tokens (up to 20 valid comments/day).",
              "Daily task cap: 40 interactions (likes + comments). No more task rewards once the cap is reached.",
            ],
          },
          {
            heading: "Team, KOL & Developer — Additional Interaction Rewards",
            items: [
              "Each like received on their own posts: +5 tokens.",
              "Each comment received on their own posts: +5 tokens.",
              "Daily cap: 2,000 tokens received via interactions; amounts beyond the cap are not accumulated.",
              "Note: Team/KOL/Developer accounts do not earn task tokens by actively liking or commenting on others' posts.",
            ],
          },
        ],
      },
      {
        heading: "Energy System (Posting Fuel)",
        intro:
          "Energy is the core resource for posting and increasing visibility. Currently granted upon identity approval; in the future it will be provided or exchanged via tokens.",
        items: [
          "1,000 energy granted automatically upon identity approval (welcome package — one-time only).",
          "Each post costs 1 energy, regardless of content type.",
          "Daily post cap: 10 posts/day (even with sufficient energy — prevents spam).",
          "Future $WBR tokens will serve as posting currency: earn/hold tokens → convert to energy → post, pin, boost, forming a complete platform economic loop.",
        ],
        subsections: [
          {
            heading: "Energy Decay & Penalty Mechanism (Encouraging Active Use)",
            intro:
              "To discourage long-term energy hoarding and reward consistent content output, the platform enforces automatic decay rules:",
            items: [
              "Daily decay: If a user has not published any content in the past 48 hours, the system automatically deducts 5% of their current energy (rounded down) at 00:00 UTC each day. Example: 1,000 energy → no post for 48 h → deduct 50, remaining 950.",
              "7-day inactivity wipe: If a user has published no content for 7 consecutive days (168 hours), their energy balance is automatically reset to 0 at the end of the 7th day. After a wipe, energy can be restored via future $WBR token exchange, but the one-time welcome package will not be re-issued.",
              "Purpose: The combination of 5% daily decay (every 48 h) and a 7-day full wipe creates predictable, sustained pressure that motivates users to publish at least weekly — building a healthy, highly-active content ecosystem.",
            ],
          },
        ],
      },
      {
        heading: "Posting Rules (Full)",
        subsections: [
          {
            heading: "1. Identity Application & Energy Threshold",
            items: [
              "Choose one identity tag (only one): Crypto Team, KOL (Key Opinion Leader), or Developer.",
              "Upon approval, the system automatically grants 1,000 energy.",
              "Each post costs 1 energy (no energy = cannot post; replenish via future token exchange).",
              "Daily post limit: max 10/day.",
            ],
          },
          {
            heading: "2. Post Tags & Auto-Routing",
            items: [
              "Select a content-type tag when posting: Testnet Recruitment, IDO / Launchpad, Security Audit, Integration Announcement, Airdrop Plan, Funding / Hiring, Node Recruitment, Hackathon / Bug Bounty, Other.",
              "Crypto Team posts: automatically featured in the Elite Teams section on the homepage (one slot per team).",
              "KOL posts: automatically routed to the KOL Zone + KOL leaderboard (ranked by likes, comments, and views in real time).",
              "Developer posts: automatically routed to the Developer Column (vertical display for fast talent discovery, separate from the main homepage feed).",
            ],
          },
          {
            heading: "3. Content Moderation & Priority",
            items: [
              "Posts are published instantly with no manual review (decentralized principle).",
              "High-energy users can apply for pinning/boosting (consumes more energy for a longer or higher-placement pin).",
              "The platform retains a reporting/takedown mechanism for obvious scams or spam content.",
            ],
          },
        ],
      },
      {
        heading: "Vision & Problems Solved",
        intro:
          "Web3 Release aims to become the Web3-era 'Twitter + LinkedIn + Gitcoin' — a truly decentralized, community-driven collaboration and publishing hub. In a trustworthy, traceable, and incentive-rich environment, crypto teams, KOLs, and developers can freely publish and collaborate, accelerating the next wave of real blockchain innovation.",
        subsections: [
          {
            heading: "Key Problems Addressed",
            items: [
              "High collaboration friction: demand and supply scattered across many platforms with extreme filtering costs.",
              "Lack of trust: low-quality invitations and rampant scams make it hard to verify project legitimacy.",
              "Unequal opportunity: developers and KOLs struggle to gain visibility without continuous incentives.",
              "Information fragmentation: redundant cross-chain content and low-quality collaboration.",
              "Centralization dependency: smaller participants rely on algorithms or paid promotion for exposure.",
            ],
          },
          {
            heading: "Web3 Release's Solutions",
            items: [
              "Identity application + content tag routing significantly lower collaboration barriers.",
              "Energy threshold (future token consumption) + daily 10-post cap establish verifiable trust.",
              "Slot pull + interactions (40 daily cap) + referral rewards (15% bonus) incentivize genuine activity and community growth.",
              "60% periodic token airdrops + 1:1 TGE conversion reward long-term contributors and drive real decentralization.",
              "Decentralized reputation system across multiple chains empowers smaller participants for a healthier, more efficient blockchain ecosystem.",
            ],
          },
        ],
      },
    ],
  },
};
