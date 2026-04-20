export type DisclaimerContent = {
  title: string;
  version: string;
  clauses: { heading: string; body: string }[];
  warningTitle: string;
  warning: string;
  footer: string;
};

export const DISCLAIMER_CONTENT: Record<string, DisclaimerContent> = {
  "zh-CN": {
    title: "免责声明",
    version: "更新日期：2026 年 4 月",
    clauses: [
      {
        heading: "免责声明",
        body:
          "本平台网站所有信息、事件数据、推荐、文档及相关内容，仅供参考和信息目的，不构成任何投资建议、财务建议、法律意见或收益承诺。",
      },
      {
        heading: "重要提醒",
        body:
          "• 平台事件来源于公开来源，平台不对信息的准确性、完整性、及时性或合法性提供任何保证。用户参与任何机会（IDO、Airdrop、Testnet、Grants 等）均需自行进行尽职调查，并承担全部风险，包括但不限于资金损失、技术故障、监管变化或欺诈风险。\n" +
          "• 平台尚未经过全面安全审计，可能存在技术局限或未预见问题。\n" +
          "• 我们不保证平台未来功能、持续可用性、特定机会的实现或任何回报。\n" +
          "• 项目方免费发布的需求由其自行负责，平台仅提供匹配工具，不承担中介、担保或责任。\n" +
          "• 平台方保留随时修改、暂停或终止任何功能或内容的权利，且无需事先通知。",
      },
      {
        heading: "同意与接受",
        body:
          "使用本网站、连接钱包、完善 Profile 或参与任何相关活动，即表示您已阅读、理解并完全同意本免责声明。如有疑问，请通过公开渠道（Telegram 或 Twitter）联系创始人。",
      },
    ],
    warningTitle: "创始人",
    warning: "Telegram： https://t.me/Web3Release",
    footer: "本声明不影响任何适用法律法规下的权利和义务。",
  },

  "en": {
    title: "Disclaimer",
    version: "Last updated: April 2026",
    clauses: [
      {
        heading: "Disclaimer",
        body:
          "All information, event data, recommendations, documents, and related content on this website are provided for reference and informational purposes only and do not constitute investment advice, financial advice, legal opinions, or any promise of returns.",
      },
      {
        heading: "Important Notice",
        body:
          "• Events and information may come from public sources. We make no warranties regarding accuracy, completeness, timeliness, or legality. Participation in any opportunity (IDO, Airdrop, Testnet, Grants, etc.) requires your own due diligence and you bear all risks, including but not limited to financial loss, technical failures, regulatory changes, or fraud risks.\n" +
          "• The platform has not undergone a comprehensive security audit and may have technical limitations or unforeseen issues.\n" +
          "• We do not guarantee future features, continued availability, the realization of any specific opportunity, or any returns.\n" +
          "• Demands posted by projects are their sole responsibility. The platform only provides matching tools and does not act as an intermediary, guarantor, or bear any liability.\n" +
          "• We reserve the right to modify, suspend, or terminate any features or content at any time without prior notice.",
      },
      {
        heading: "Acceptance",
        body:
          "By using this website, connecting a wallet, completing your profile, or participating in any related activities, you acknowledge that you have read, understood, and fully agree to this disclaimer. If you have questions, please contact the founder through public channels (Telegram or X/Twitter).",
      },
    ],
  },
};
