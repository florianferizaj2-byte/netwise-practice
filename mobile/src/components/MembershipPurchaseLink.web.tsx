import { useTheme } from "../theme";
import { membershipPurchaseUrl } from "./membership-purchase";

export function MembershipPurchaseLink({ primary = false }: { primary?: boolean }) {
  const { colors } = useTheme();
  return <a href={membershipPurchaseUrl} target="_blank" rel="noopener noreferrer"
    aria-label="购买会员兑换码" style={{ display: "flex", minHeight: 48,
      alignItems: "center", justifyContent: "space-between", gap: 10,
      border: `1px solid ${colors.border}`, borderRadius: 14, padding: "13px 18px", marginTop: 12,
      boxSizing: "border-box", background: primary ? colors.brand : colors.surface,
      color: primary ? colors.white : colors.brand, textDecoration: "none", fontSize: 16,
      fontWeight: 600, lineHeight: "22px" }}>
    <span>购买会员兑换码</span><span aria-hidden="true">↗</span>
  </a>;
}
