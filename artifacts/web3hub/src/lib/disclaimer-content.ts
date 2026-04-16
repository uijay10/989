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
    title: "Web3 Release 免责声明",
    version: "版本 1.0 · 2026年3月23日",
    clauses: [
      { heading: "1. 平台性质", body: "Web3 Release 是一个去中心化、社区驱动的 Web3 协作平台，仅提供信息发布、展示和匹配服务。平台不参与任何交易、投资、融资、代币发行或法律行为，仅作为用户间信息交流的中介工具。平台上所有内容（包括但不限于需求发布、合作意向、测试网招募、IDO 信息、空投计划、招聘、节点招募等）均由用户自行发布，平台不拥有、不控制、不担保其真实性、合法性、完整性或安全性。" },
      { heading: "2. 用户责任", body: "用户在使用平台时，应自行判断内容的真实性、可信度和风险。用户之间的一切互动、合作、交易、转账、投资等行为均为双方自愿、私下达成，与 Web3 Release 平台无关。用户因基于平台信息产生的任何损失、纠纷、法律责任，均由用户自行承担，平台不承担任何连带责任。" },
      { heading: "3. 无投资建议", body: "平台上出现的任何项目信息、代币、空投、IDO、Launchpad、融资公告、节点招募等内容，不构成任何形式的投资建议、金融建议、法律建议或商业承诺。平台不提供投资咨询服务，用户参与任何项目均需自行评估风险，并遵守当地法律法规。投资有风险，入市需谨慎。" },
      { heading: "4. 代币声明", body: "平台当前代币系统仅用于记录用户贡献与活跃度，是未来 $WBR 代币空投分配的重要凭证，但不保证任何兑换价值或收益。未来 $WBR 代币（如发行）仅用于平台内能量消耗、发布门槛等实用功能，不构成证券、金融衍生品或投资工具。平台不承诺任何代币升值、回报、分红或流动性。代币相关事宜以最终白皮书、DAO 治理决议为准。" },
      { heading: "5. 技术与安全风险", body: "平台基于区块链和钱包连接技术运行，可能存在智能合约漏洞、网络攻击、钱包安全问题、DNS 解析延迟、DDoS 等技术风险。用户需自行保护钱包私钥、助记词等信息，避免钓鱼、诈骗。平台不对因用户操作失误、技术故障导致的资产损失负责。" },
      { heading: "6. 第三方链接与内容", body: "平台可能链接外部网站、社交媒体、项目官网等第三方资源，这些链接仅供参考，平台不控制、不审核、不担保其内容。用户访问第三方链接产生的任何后果，由用户自行承担。" },
      { heading: "7. 法律适用与管辖", body: "本免责声明受美利坚合众国法律管辖（如有争议，以美利坚合众国法院为第一审管辖）。平台保留随时修改本声明的权利，修改后继续使用即视为同意。" },
    ],
    warningTitle: "重要提醒",
    warning: "使用 Web3 Release 即表示您已阅读、理解并完全同意本免责声明。平台不向任何用户提供任何明示或默示的担保或承诺。参与 Web3 生态存在高风险，请用户理性判断、谨慎行事。如不同意本声明，请立即停止使用平台。",
    footer: "Web3 Release 团队 · 2026年3月23日",
  },

  "en": {
    title: "Web3 Release Disclaimer",
    version: "Version 1.0 · March 23, 2026",
    clauses: [
      { heading: "1. Nature of the Platform", body: "Web3 Release is a decentralized, community-driven Web3 collaboration platform that provides only information publishing, display, and matching services. The platform does not participate in any transactions, investments, financing, token issuances, or legal actions, and serves solely as an intermediary tool for information exchange between users. All content on the platform (including but not limited to demand posts, collaboration intentions, testnet recruitment, IDO information, airdrop plans, hiring, node recruitment, etc.) is published by users themselves. The platform does not own, control, or warrant the authenticity, legality, completeness, or security of such content." },
      { heading: "2. User Responsibility", body: "Users must independently assess the authenticity, credibility, and risks of any content when using the platform. All interactions, collaborations, transactions, transfers, investments, and other actions between users are voluntary and privately arranged, and are unrelated to the Web3 Release platform. Any losses, disputes, or legal liabilities arising from reliance on platform information are borne solely by the users; the platform assumes no joint liability." },
      { heading: "3. No Investment Advice", body: "Any project information, tokens, airdrops, IDOs, Launchpads, funding announcements, node recruitment listings, or other content appearing on the platform does not constitute any form of investment, financial, legal, or business advice or commitment. The platform does not provide investment consulting services. Users must independently assess risks before participating in any project and comply with applicable local laws and regulations. Investment involves risk — proceed with caution." },
      { heading: "4. Token Statement", body: "The current token system is used solely to record user contributions and activity levels, serving as an important credential for future $WBR token airdrop distributions, but no exchange value or returns are guaranteed. Future $WBR tokens (if issued) are intended only for practical platform functions such as energy consumption and publishing thresholds, and do not constitute securities, financial derivatives, or investment instruments. The platform makes no commitment regarding token appreciation, returns, dividends, or liquidity. Token-related matters are subject to the final whitepaper and DAO governance resolutions." },
      { heading: "5. Technical & Security Risks", body: "The platform operates on blockchain and wallet-connection technology and may be subject to technical risks including smart contract vulnerabilities, cyberattacks, wallet security issues, DNS resolution delays, DDoS attacks, and more. Users are responsible for protecting their own wallet private keys, seed phrases, and other sensitive information to avoid phishing and fraud. The platform is not liable for asset losses resulting from user errors or technical failures." },
      { heading: "6. Third-Party Links & Content", body: "The platform may link to external websites, social media, project official sites, and other third-party resources. These links are provided for reference only; the platform does not control, review, or warrant their content. Users assume full responsibility for any consequences arising from accessing third-party links." },
      { heading: "7. Applicable Law & Jurisdiction", body: "This disclaimer is governed by the laws of the United States of America (in the event of a dispute, the courts of the United States of America shall have first-instance jurisdiction). The platform reserves the right to modify this disclaimer at any time; continued use after modification constitutes acceptance." },
    ],
    warningTitle: "Important Notice",
    warning: "By using Web3 Release, you confirm that you have read, understood, and fully agreed to this disclaimer. The platform makes no express or implied warranties or commitments to any user. Participating in the Web3 ecosystem involves high risk — please exercise rational judgment and proceed with caution. If you do not agree to this disclaimer, please stop using the platform immediately.",
    footer: "Web3 Release Team · March 23, 2026",
  },

  "de": {
    title: "Web3 Release Haftungsausschluss",
    version: "Version 1.0 · 23. März 2026",
    clauses: [
      { heading: "1. Art der Plattform", body: "Web3 Release ist eine dezentralisierte, community-getriebene Web3-Kollaborationsplattform, die ausschließlich Informationsveröffentlichungs-, Anzeige- und Matching-Dienste anbietet. Die Plattform nimmt nicht an Transaktionen, Investitionen, Finanzierungen, Token-Ausgaben oder rechtlichen Handlungen teil. Alle Inhalte auf der Plattform werden von Nutzern selbst veröffentlicht; die Plattform übernimmt keine Garantie für deren Authentizität, Rechtmäßigkeit oder Vollständigkeit." },
      { heading: "2. Nutzerverantwortung", body: "Nutzer müssen die Authentizität, Glaubwürdigkeit und Risiken von Inhalten selbst beurteilen. Alle Interaktionen zwischen Nutzern sind freiwillig und privat vereinbart und stehen in keinem Zusammenhang mit der Web3 Release-Plattform. Verluste, Streitigkeiten oder rechtliche Haftungen aus der Nutzung der Plattforminformationen werden allein vom Nutzer getragen." },
      { heading: "3. Keine Anlageberatung", body: "Keine Inhalte auf der Plattform stellen Anlage-, Finanz-, Rechts- oder Geschäftsempfehlungen dar. Die Plattform bietet keine Anlageberatung. Nutzer müssen Risiken eigenständig bewerten und lokale Gesetze einhalten. Investitionen sind mit Risiken verbunden." },
      { heading: "4. Token-Erklärung", body: "Das Token-System dient ausschließlich der Aufzeichnung von Nutzerbeiträgen und -aktivitäten als Nachweis für zukünftige $WBR-Token-Airdrops, garantiert jedoch keinen Tauschwert oder Ertrag. Zukünftige $WBR-Token (sofern ausgegeben) dienen nur praktischen Plattformfunktionen wie Energieverbrauch und Veröffentlichungsschwellen und stellen keine Wertpapiere, Finanzderivate oder Anlageinstrumente dar. Die Plattform garantiert keine Token-Wertsteigerung, Renditen, Dividenden oder Liquidität. Token-bezogene Angelegenheiten richten sich nach dem endgültigen Whitepaper und den DAO-Governance-Beschlüssen." },
      { heading: "5. Technische und Sicherheitsrisiken", body: "Die Plattform basiert auf Blockchain- und Wallet-Verbindungstechnologie und kann technischen Risiken ausgesetzt sein. Nutzer sind für den Schutz ihrer privaten Schlüssel und Seed-Phrasen selbst verantwortlich. Die Plattform haftet nicht für Vermögensverluste aufgrund von Nutzerfehlern oder technischen Ausfällen." },
      { heading: "6. Links und Inhalte Dritter", body: "Die Plattform kann Links zu externen Websites und anderen Drittanbieter-Ressourcen enthalten. Diese Links dienen nur als Referenz; die Plattform übernimmt keine Verantwortung für deren Inhalte." },
      { heading: "7. Anwendbares Recht und Gerichtsstand", body: "Dieser Haftungsausschluss unterliegt dem Recht der Vereinigten Staaten von Amerika. Die Plattform behält sich das Recht vor, diesen Haftungsausschluss jederzeit zu ändern; die weitere Nutzung nach einer Änderung gilt als Zustimmung." },
    ],
    warningTitle: "Wichtiger Hinweis",
    warning: "Durch die Nutzung von Web3 Release bestätigen Sie, dass Sie diesen Haftungsausschluss gelesen, verstanden und vollständig akzeptiert haben. Die Teilnahme am Web3-Ökosystem ist mit hohen Risiken verbunden. Bitte handeln Sie mit Vernunft und Vorsicht.",
    footer: "Web3 Release Team · 23. März 2026",
  },

  "ru": {
    title: "Отказ от ответственности Web3 Release",
    version: "Версия 1.0 · 23 марта 2026 г.",
    clauses: [
      { heading: "1. Характер платформы", body: "Web3 Release — децентрализованная, управляемая сообществом платформа Web3-коллаборации, предоставляющая только услуги публикации информации, отображения и подбора. Платформа не участвует в транзакциях, инвестициях, финансировании или юридических действиях. Весь контент публикуется пользователями самостоятельно; платформа не гарантирует его достоверность, законность или полноту." },
      { heading: "2. Ответственность пользователей", body: "Пользователи должны самостоятельно оценивать достоверность, надёжность и риски контента. Все взаимодействия между пользователями являются добровольными и частными, не связанными с платформой Web3 Release. Любые убытки, споры или правовая ответственность, возникшие в результате использования информации платформы, несут сами пользователи." },
      { heading: "3. Отсутствие инвестиционных советов", body: "Никакой контент на платформе не является инвестиционной, финансовой или юридической рекомендацией. Платформа не предоставляет консультационных услуг. Пользователи должны самостоятельно оценивать риски и соблюдать местное законодательство. Инвестиции сопряжены с риском." },
      { heading: "4. Заявление о токенах", body: "Система токенов служит только для учёта вкладов и активности пользователей как свидетельство для будущих аирдропов $WBR, но не гарантирует никакой ценности или дохода. Будущие токены $WBR (при выпуске) предназначены только для практических функций платформы — потребления энергии и порогов публикации — и не являются ценными бумагами, финансовыми деривативами или инвестиционными инструментами. Платформа не гарантирует удорожания токенов, доходности, дивидендов или ликвидности. Вопросы, связанные с токенами, регулируются окончательным белым документом и решениями DAO." },
      { heading: "5. Технические и риски безопасности", body: "Платформа работает на технологии блокчейн и подключения кошельков, что может сопровождаться техническими рисками. Пользователи несут ответственность за защиту своих приватных ключей и мнемонических фраз. Платформа не несёт ответственности за убытки в результате ошибок пользователей или технических сбоев." },
      { heading: "6. Сторонние ссылки и контент", body: "Платформа может содержать ссылки на сторонние ресурсы. Эти ссылки носят справочный характер; платформа не контролирует и не гарантирует их содержание. Последствия от посещения сторонних ссылок несут сами пользователи." },
      { heading: "7. Применимое право и юрисдикция", body: "Настоящий отказ от ответственности регулируется законодательством Соединённых Штатов Америки. Платформа оставляет за собой право изменять настоящий документ в любое время; продолжение использования после изменений означает согласие." },
    ],
    warningTitle: "Важное уведомление",
    warning: "Используя Web3 Release, вы подтверждаете, что прочитали, поняли и полностью согласны с настоящим отказом от ответственности. Участие в экосистеме Web3 сопряжено с высоким риском. Действуйте рационально и осторожно.",
    footer: "Команда Web3 Release · 23 марта 2026 г.",
  },

  "fr": {
    title: "Clause de non-responsabilité Web3 Release",
    version: "Version 1.0 · 23 mars 2026",
    clauses: [
      { heading: "1. Nature de la plateforme", body: "Web3 Release est une plateforme de collaboration Web3 décentralisée et communautaire qui fournit uniquement des services de publication, d'affichage et de mise en relation d'informations. La plateforme ne participe pas aux transactions, investissements, financements ou actions juridiques. Tout le contenu est publié par les utilisateurs eux-mêmes ; la plateforme ne garantit pas son authenticité, sa légalité ou son exhaustivité." },
      { heading: "2. Responsabilité des utilisateurs", body: "Les utilisateurs doivent évaluer de manière indépendante l'authenticité, la crédibilité et les risques du contenu. Toutes les interactions entre utilisateurs sont volontaires et privées, sans lien avec la plateforme Web3 Release. Toute perte, litige ou responsabilité légale découlant de l'utilisation des informations de la plateforme est supporté par les utilisateurs eux-mêmes." },
      { heading: "3. Absence de conseil en investissement", body: "Aucun contenu sur la plateforme ne constitue un conseil en investissement, financier, juridique ou commercial. La plateforme ne fournit pas de services de conseil en investissement. Les utilisateurs doivent évaluer les risques de manière indépendante et respecter les lois locales applicables. Investir comporte des risques." },
      { heading: "4. Déclaration sur les tokens", body: "Le système de tokens sert uniquement à enregistrer les contributions et l'activité des utilisateurs comme justificatif pour les futurs airdrops de $WBR, sans garantir de valeur d'échange ou de rendement. Les futurs tokens $WBR (si émis) sont destinés uniquement aux fonctions pratiques de la plateforme — consommation d'énergie et seuils de publication — et ne constituent pas des valeurs mobilières, des dérivés financiers ou des instruments d'investissement. La plateforme ne garantit aucune appréciation, rendement, dividende ou liquidité. Les questions relatives aux tokens sont régies par le livre blanc final et les résolutions de gouvernance DAO." },
      { heading: "5. Risques techniques et de sécurité", body: "La plateforme fonctionne sur la technologie blockchain et de connexion de portefeuille, pouvant être soumise à des risques techniques. Les utilisateurs sont responsables de la protection de leurs clés privées et phrases de récupération. La plateforme n'est pas responsable des pertes d'actifs dues à des erreurs d'utilisateurs ou à des défaillances techniques." },
      { heading: "6. Liens et contenu tiers", body: "La plateforme peut contenir des liens vers des ressources tierces. Ces liens sont fournis à titre de référence uniquement ; la plateforme ne contrôle pas leur contenu. Les conséquences de l'accès aux liens tiers sont à la charge des utilisateurs." },
      { heading: "7. Droit applicable et juridiction", body: "Cette clause de non-responsabilité est régie par le droit des États-Unis d'Amérique. La plateforme se réserve le droit de modifier ce document à tout moment ; la poursuite de l'utilisation après modification vaut acceptation." },
    ],
    warningTitle: "Avertissement important",
    warning: "En utilisant Web3 Release, vous confirmez avoir lu, compris et accepté intégralement cette clause de non-responsabilité. La participation à l'écosystème Web3 comporte des risques élevés. Faites preuve de jugement rationnel et de prudence.",
    footer: "Équipe Web3 Release · 23 mars 2026",
  },

  "ja": {
    title: "Web3 Release 免責事項",
    version: "バージョン 1.0 · 2026年3月23日",
    clauses: [
      { heading: "1. プラットフォームの性質", body: "Web3 Release は分散型・コミュニティ主導の Web3 コラボレーションプラットフォームであり、情報の公開・表示・マッチングサービスのみを提供します。プラットフォームは取引、投資、資金調達、トークン発行、法的行為には一切関与しません。すべてのコンテンツはユーザー自身が公開するものであり、プラットフォームはその真実性、合法性、完全性または安全性を保証しません。" },
      { heading: "2. ユーザーの責任", body: "ユーザーはコンテンツの真実性、信頼性およびリスクを自ら判断する必要があります。ユーザー間のすべてのやり取りは任意かつ私的に取り決められるものであり、Web3 Release プラットフォームとは無関係です。プラットフォーム情報に基づくいかなる損失、紛争、法的責任もユーザーが単独で負担します。" },
      { heading: "3. 投資アドバイスの不提供", body: "プラットフォーム上のいかなるコンテンツも、投資、金融、法律または事業上のアドバイスを構成しません。プラットフォームは投資コンサルティングサービスを提供しません。ユーザーはリスクを自ら評価し、現地の法律を遵守する必要があります。投資にはリスクが伴います。" },
      { heading: "4. トークンに関する声明", body: "現在のトークンシステムは、ユーザーの貢献と活動を記録するためだけに使用され、将来の $WBR トークンのエアドロップ配布の証拠となりますが、交換価値や収益を保証するものではありません。将来の $WBR トークン（発行される場合）はプラットフォームのエネルギー消費・発行閾値等の実用的な機能のみに使用され、有価証券、金融デリバティブまたは投資ツールを構成しません。プラットフォームはトークンの値上がり、リターン、配当または流動性についていかなるコミットメントも行いません。トークン関連事項は最終的なホワイトペーパーおよびDAOガバナンス決議に従います。" },
      { heading: "5. 技術的・セキュリティリスク", body: "プラットフォームはブロックチェーンとウォレット接続技術で動作しており、技術的リスクが存在する可能性があります。ユーザーは秘密鍵やシードフレーズを自ら保護する責任があります。プラットフォームはユーザーのミスや技術的障害による資産損失について責任を負いません。" },
      { heading: "6. 第三者リンクとコンテンツ", body: "プラットフォームは第三者のウェブサイトやリソースへのリンクを含む場合があります。これらのリンクは参照目的のみであり、プラットフォームはその内容を管理・保証しません。第三者リンクへのアクセスによって生じる結果はユーザーが負担します。" },
      { heading: "7. 準拠法と管轄", body: "この免責事項はアメリカ合衆国法に準拠します。プラットフォームはいつでも本免責事項を変更する権利を留保します。変更後の継続使用は同意とみなします。" },
    ],
    warningTitle: "重要なお知らせ",
    warning: "Web3 Release を使用することにより、お客様はこの免責事項を読み、理解し、完全に同意したことを確認します。Web3 エコシステムへの参加には高いリスクが伴います。合理的な判断で慎重に行動してください。",
    footer: "Web3 Release チーム · 2026年3月23日",
  },

  "ko": {
    title: "Web3 Release 면책 조항",
    version: "버전 1.0 · 2026년 3월 23일",
    clauses: [
      { heading: "1. 플랫폼의 성격", body: "Web3 Release는 탈중앙화된 커뮤니티 기반 Web3 협업 플랫폼으로, 정보 게시, 표시 및 매칭 서비스만을 제공합니다. 플랫폼은 거래, 투자, 자금 조달, 토큰 발행 또는 법적 행위에 참여하지 않습니다. 모든 콘텐츠는 사용자가 직접 게시하며, 플랫폼은 그 진실성, 합법성, 완전성 또는 안전성을 보증하지 않습니다." },
      { heading: "2. 사용자 책임", body: "사용자는 콘텐츠의 진실성, 신뢰성 및 위험성을 스스로 판단해야 합니다. 사용자 간의 모든 상호작용은 자발적이고 사적으로 이루어지며 Web3 Release 플랫폼과 무관합니다. 플랫폼 정보에 기반한 손실, 분쟁 또는 법적 책임은 사용자가 단독으로 부담합니다." },
      { heading: "3. 투자 조언 없음", body: "플랫폼의 어떠한 콘텐츠도 투자, 금융, 법률 또는 사업 조언을 구성하지 않습니다. 플랫폼은 투자 컨설팅 서비스를 제공하지 않습니다. 사용자는 위험을 독립적으로 평가하고 현지 법률을 준수해야 합니다. 투자에는 위험이 수반됩니다." },
      { heading: "4. 토큰 성명", body: "현재 토큰 시스템은 사용자의 기여도와 활동을 기록하기 위한 용도로만 사용되며 미래 $WBR 토큰 에어드롭 배분의 증빙이 됩니다. 하지만 교환 가치나 수익을 보장하지 않습니다. 미래 $WBR 토큰(발행 시)은 에너지 소비 및 게시 임계값 등 플랫폼의 실용적 기능에만 사용되며 증권, 금융 파생상품 또는 투자 수단을 구성하지 않습니다. 플랫폼은 토큰 가치 상승, 수익, 배당금 또는 유동성에 대해 어떠한 약속도 하지 않습니다. 토큰 관련 사항은 최종 백서 및 DAO 거버넌스 결의에 따릅니다." },
      { heading: "5. 기술 및 보안 위험", body: "플랫폼은 블록체인 및 지갑 연결 기술로 운영되며 기술적 위험에 노출될 수 있습니다. 사용자는 개인 키와 시드 구문을 스스로 보호해야 합니다. 플랫폼은 사용자 오류나 기술적 장애로 인한 자산 손실에 대해 책임을 지지 않습니다." },
      { heading: "6. 제3자 링크 및 콘텐츠", body: "플랫폼은 제3자 웹사이트나 리소스로의 링크를 포함할 수 있습니다. 이러한 링크는 참조용으로만 제공되며 플랫폼은 해당 콘텐츠를 통제하거나 보증하지 않습니다. 제3자 링크 접근으로 인한 결과는 사용자가 부담합니다." },
      { heading: "7. 준거법 및 관할권", body: "본 면책 조항은 미합중국 법률의 적용을 받습니다. 플랫폼은 언제든지 본 면책 조항을 수정할 권리를 보유합니다. 수정 후 계속 사용하면 동의한 것으로 간주합니다." },
    ],
    warningTitle: "중요 공지",
    warning: "Web3 Release를 사용함으로써 귀하는 본 면책 조항을 읽고, 이해하고, 완전히 동의했음을 확인합니다. Web3 생태계 참여에는 높은 위험이 수반됩니다. 합리적으로 판단하고 신중하게 행동하십시오.",
    footer: "Web3 Release 팀 · 2026년 3월 23일",
  },

  "vi": {
    title: "Tuyên bố miễn trách nhiệm Web3 Release",
    version: "Phiên bản 1.0 · 23 tháng 3, 2026",
    clauses: [
      { heading: "1. Bản chất nền tảng", body: "Web3 Release là nền tảng cộng tác Web3 phi tập trung, do cộng đồng vận hành, chỉ cung cấp dịch vụ đăng tải, hiển thị và kết nối thông tin. Nền tảng không tham gia vào bất kỳ giao dịch, đầu tư, tài trợ, phát hành token hay hành động pháp lý nào. Mọi nội dung đều do người dùng tự đăng; nền tảng không đảm bảo tính xác thực, hợp pháp hay đầy đủ của chúng." },
      { heading: "2. Trách nhiệm của người dùng", body: "Người dùng phải tự đánh giá tính xác thực, độ tin cậy và rủi ro của nội dung. Mọi tương tác giữa người dùng đều là tự nguyện và riêng tư, không liên quan đến nền tảng Web3 Release. Mọi tổn thất, tranh chấp hoặc trách nhiệm pháp lý phát sinh từ việc dựa vào thông tin nền tảng đều do người dùng tự chịu." },
      { heading: "3. Không có lời khuyên đầu tư", body: "Không có nội dung nào trên nền tảng cấu thành lời khuyên đầu tư, tài chính, pháp lý hay thương mại. Nền tảng không cung cấp dịch vụ tư vấn đầu tư. Người dùng phải tự đánh giá rủi ro và tuân thủ pháp luật địa phương. Đầu tư có rủi ro." },
      { heading: "4. Tuyên bố về token", body: "Hệ thống token hiện tại chỉ dùng để ghi lại đóng góp và hoạt động của người dùng làm bằng chứng cho các đợt airdrop $WBR trong tương lai, nhưng không đảm bảo giá trị quy đổi hay lợi nhuận. Token $WBR trong tương lai (nếu được phát hành) chỉ dành cho các chức năng thực tế của nền tảng như tiêu thụ năng lượng và ngưỡng đăng bài, không cấu thành chứng khoán, phái sinh tài chính hay công cụ đầu tư. Nền tảng không cam kết bất kỳ sự tăng giá, lợi nhuận, cổ tức hay thanh khoản nào. Các vấn đề liên quan đến token tuân theo sách trắng cuối cùng và nghị quyết quản trị DAO." },
      { heading: "5. Rủi ro kỹ thuật và bảo mật", body: "Nền tảng hoạt động trên công nghệ blockchain và kết nối ví, có thể gặp các rủi ro kỹ thuật. Người dùng có trách nhiệm bảo vệ khóa riêng tư và cụm từ khôi phục của mình. Nền tảng không chịu trách nhiệm về tổn thất tài sản do lỗi người dùng hoặc sự cố kỹ thuật." },
      { heading: "6. Liên kết và nội dung bên thứ ba", body: "Nền tảng có thể chứa các liên kết đến tài nguyên bên thứ ba. Các liên kết này chỉ mang tính tham khảo; nền tảng không kiểm soát hay đảm bảo nội dung của chúng. Hậu quả từ việc truy cập các liên kết bên thứ ba do người dùng tự chịu." },
      { heading: "7. Luật áp dụng và thẩm quyền tài phán", body: "Tuyên bố miễn trách nhiệm này được điều chỉnh bởi luật pháp Hợp chủng quốc Hoa Kỳ. Nền tảng bảo lưu quyền sửa đổi tài liệu này bất cứ lúc nào; việc tiếp tục sử dụng sau khi sửa đổi được coi là chấp thuận." },
    ],
    warningTitle: "Lưu ý quan trọng",
    warning: "Bằng cách sử dụng Web3 Release, bạn xác nhận đã đọc, hiểu và đồng ý hoàn toàn với tuyên bố miễn trách nhiệm này. Tham gia hệ sinh thái Web3 có rủi ro cao. Hãy phán đoán hợp lý và hành động cẩn thận.",
    footer: "Nhóm Web3 Release · 23 tháng 3, 2026",
  },
};
