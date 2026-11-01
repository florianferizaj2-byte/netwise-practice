# 会员每日签到积分
## 默认规则
免费 1 / VIP 33 / SVIP 66 / SSVIP 133 积分，每个账号按北京时间自然日只能领取一次；当日有效，不补签、不累计到下一天。同一天换证书、升级会员或修改配置均不再补发。会员过期按免费档领取。

会员不再自动整笔发放 990/1990/3990 月积分。已经发到账本的历史月积分不扣回、不清零、不延长原到期日；历史整期积分尚未到期的付费账号，该已支付周期不再叠加每日会员积分，到期后自动改为每日签到。此前已签到的 5 积分记录原样保留。

## 后台入口
管理中心 → 用量与成本 → 每日签到积分。可修改四档额度、启停签到、开启发放预算校验。金额为 1~100000 整数且随档位不递减；保存需要说明，配置有版本号、重试幂等和审计记录，重启不丢失。

默认作为运营赠送入账，不因未登记销售收入而阻止签到，不伪造收入。真实 AI 的费率、预扣、退款、调用成本保护均未修改；可签到不等于所有模型已配置或预算已足够。后续单独核算毛利。

## 接口
- GET /api/account/check-in：查询本账号今日签到、实际可领取数、当前规则与钱包。
- POST /api/account/check-in：请求体 {}；金额、日期、会员等级由服务端决定。返回顶层 claimed 表示本次是否新发放，checkIn.claimed 表示今日是否已领。
- GET /api/admin/points/check-in-policy：管理员读取配置。
- PUT /api/admin/points/check-in-policy：管理员保存；包括 requestId(UUID)、revision、enabled、requireFunded、dailyPoints.free/vip/svip/ssvip、reason(至少8字)。
- 现有 /api/account/entitlements 和 /api/account/points 返回兼容字段，增加每日发放规则与 dailyPoints 信息。

已领取后返回的是实际领取快照，不随改配置变成新的数额。过渡期或停用时 canClaim=false，disabledReason 给出原因；旧 App 仍可通过原 POST 接口领取新额度，过渡账号重复请求会被服务端阻止。

## 上线
更新本分支后端与新构建的 Web，保留原 .env、DATA_DIR、AI_MASTER_KEY、头像和已有 dist/app/。表与默认配置随原数据库启动补齐，不清库。新装实例默认即为上述每日额度。原生 App 源码已同步字段与提示；本次未重新构建 APK、未构建手机网页、未部署服务器。
