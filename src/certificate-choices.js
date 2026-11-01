const metadata = {
  "sichuan-upgrading-computer": {
    category: "upgrade",
    region: "sichuan",
    aliases: "四川 专升本 计算机基础",
    artCertificate: "sichuan-upgrading-computer",
    artChapter: "computer-foundations",
  },
  "network-engineer": {
    category: "software",
    aliases: "软考 网工 网络 路由 交换",
    artCertificate: "network-engineer",
    artChapter: "路由与广域网技术",
  },
  "hcia-datacom": {
    category: "certification",
    aliases: "华为 H12-811 数通 HCIA",
    artCertificate: "hcia-datacom",
    artChapter: "ip-routing",
  },
  "ncre-ms-office": {
    category: "certification",
    aliases: "计算机等级 二级 Word Excel PowerPoint",
    artCertificate: "ncre-ms-office",
    artChapter: "office-basics",
  },
  "ncre-l2-c-programming": {
    category: "certification",
    aliases: "计算机等级 二级 C语言 C 语言 程序设计 NCRE",
    artCertificate: "ncre-l2-c-programming",
    artChapter: "program-structure",
  },
  "veterinary-practitioner": {
    category: "profession",
    aliases: "执业 兽医 全科",
  },
  "hcip-datacom-core": {
    category: "certification",
    aliases: "华为 HCIP 数通 H12-821 核心 Core",
    artCertificate: "hcip-datacom-core",
    artChapter: "routing-basics",
  },
  "hcip-datacom-advanced": {
    category: "certification",
    aliases: "华为 HCIP 数通 H12-831 高级 路由 交换 Advanced",
    artCertificate: "hcip-datacom-advanced",
    artChapter: "mpls",
  },
};
export const certificateCategories = {
  all: "全部",
  upgrade: "专升本",
  software: "软考",
  certification: "认证考试",
  profession: "职业资格",
  other: "其他",
};
// Availability always comes from the authenticated server catalogue, never demo flags.
export function certificateChoices(certificates) {
  return certificates.map((c) => ({
    ...metadata[c.id],
    category: metadata[c.id]?.category || "other",
    region: metadata[c.id]?.region || "general",
    ...c,
    title: c.shortName || c.name,
    available: true,
  }));
}
export function filterCertificateChoices(
  choices,
  { query = "", category = "all", region = "all" } = {},
) {
  const text = query.normalize("NFKC").trim().toLocaleLowerCase();
  return choices.filter(
    (c) =>
      (category === "all" || c.category === category) &&
      (region === "all" || c.region === region) &&
      (!text ||
        [
          c.title,
          c.name,
          c.description,
          c.aliases,
          certificateCategories[c.category],
        ]
          .filter(Boolean)
          .join(" ")
          .normalize("NFKC")
          .toLocaleLowerCase()
          .includes(text)),
  );
}
