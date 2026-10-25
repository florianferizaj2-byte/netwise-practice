import { membershipPlans } from "./memberships.js";
import { studyError } from "./study-content.js";

export function requireStudyMember(store, req, requestUserId) {
  if (!req.user) throw studyError("请先登录", 401);
  const userId = requestUserId(req),
    entitlement = store.accountEntitlement(userId);
  if (!Object.hasOwn(membershipPlans, entitlement.plan))
    throw studyError(
      "AI 精讲与练习仅限有效 VIP 会员，请先开通或续期",
      403,
      "STUDY_MEMBERSHIP_REQUIRED",
    );
  return { userId, plan: entitlement.plan, entitlement };
}
