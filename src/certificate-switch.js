// An interrupted response may have committed the target on the server already.
export async function requestCertificateSwitch(
  api,
  certificateId,
  currentUser,
) {
  const matches = (user) =>
    user?.id === currentUser.id && user.certificateId === certificateId;
  try {
    const result = await api("/auth/certificate", { certificateId }, "PUT");
    if (!matches(result?.user))
      throw new Error("未能确认备考目标，请重新读取。");
    return result.user;
  } catch (cause) {
    if (cause.status >= 400 && cause.status < 500) throw cause;
    let current;
    try {
      current = await api("/auth/me", undefined, undefined, { cache: false });
    } catch {
      throw Object.assign(
        new Error(
          "暂时无法确认切换结果，请重新加载页面；已有学习记录仍保存在账号中。",
        ),
        { certificateStateUnknown: true },
      );
    }
    if (!current.authenticated)
      throw Object.assign(new Error("登录已失效，请重新登录。"), {
        status: 401,
      });
    if (matches(current.user)) return current.user;
    if (
      current.user?.id !== currentUser.id ||
      current.user?.certificateId !== currentUser.certificateId
    )
      throw Object.assign(
        new Error("账号或备考目标已在其他窗口改变，请重新加载页面。"),
        { certificateStateUnknown: true },
      );
    throw cause;
  }
}
