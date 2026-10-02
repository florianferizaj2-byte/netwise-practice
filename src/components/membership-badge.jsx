import "../membership.css";
const labels = { free: "Free", vip: "VIP", svip: "SVIP", ssvip: "SSVIP" };
export function MembershipBadge({ plan = "free" }) {
  const tier = labels[plan] ? plan : "free";
  return (
    <span className={`member-tier member-tier-${tier}`}>{labels[tier]}</span>
  );
}
