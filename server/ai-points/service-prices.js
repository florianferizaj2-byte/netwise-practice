import { authorAiSettings, managedAiCandidates } from '../ai-service.js';
import { aiOutputBudget } from '../ai-output-policy.js';
import { officialRateCards, validRateCard, officialRateAt, pricingSource } from './pricing.js';
import {accountPointsPlans} from './account.js';
import {readCheckInPolicy} from './check-in-policy.js';
import { chargeUnits, tokenCost, SERVICE_MARGIN_BPS, TARGET_MARGIN_BPS, POINT_SCALE, pointLiabilityMicros } from './money.js';

// Examples, not fixed prices or reservations. Every model round uses the same
// explicit input assumption; output allowances come from the production policy.
export const sampleInputTokens = 1000;
export const pointServices = [
  { id: 'hint', name: '分步提示', steps: ['question-hint', 'hint-review'] },
  { id: 'explanation', name: '题目详解 / 换种方法', steps: ['question-explanation'] },
  { id: 'mistake', name: '错因分析', steps: ['mistake-analysis'] },
  { id: 'plan', name: 'AI 学习计划', steps: ['daily-plan'] },
  ...[1, 3, 5, 10].map(count => ({
    id: `questions-${count}`, name: `AI 出题 ${count} 道（含审核）`, count,
    steps: ['question-generation', 'question-review'],
  })),
  { id: 'grading', name: '主观题 AI 复核', steps: ['study-grading'] },
  { id: 'study-teacher', name: 'AI 精炼老师答疑', steps: ['study-teacher'] },
  { id: 'tutor-teacher', name: '互动精讲答疑（含审核）', steps: ['interactive-tutor-teacher', 'interactive-tutor-review'] },
  { id: 'course', name: '生成短课与练习（含审核）', steps: ['study-generation', 'study-content-review'] },
  { id: 'connection', name: '管理员接口连接测试', steps: ['admin-connection-test'] },
];

export function modelPointExamples(card) {
  const cost = (input, output, cached = 0) => tokenCost({
    prompt_tokens: input, completion_tokens: output, cached_prompt_tokens: cached,
  }, card);
  const units = costMicros => chargeUnits(costMicros, SERVICE_MARGIN_BPS);
  return {
    inputUnitsPer1000: units(cost(1000, 0)),
    outputUnitsPer1000: units(cost(0, 1000)),
    cachedInputUnitsPer1000: units(cost(1000, 0, 1000)),
    services: pointServices.map(service => {
      const steps = service.steps.map(taskType => ({ taskType,
        inputTokens: sampleInputTokens,
        outputTokens: aiOutputBudget({ taskType, outputItemCount: service.count }).maxTokens,
      }));
      return { id: service.id, name: service.name, steps,
        sampleUnits: units(steps.reduce((total, step) => total + cost(step.inputTokens, step.outputTokens), 0)),
        sampleCostMicros: steps.reduce((total, step) => total + cost(step.inputTokens, step.outputTokens), 0),
      };
    }),
  };
}

export function membershipCostForecast(store) {
  const plans=accountPointsPlans(store),checkIn=readCheckInPolicy(store),reserveBps=SERVICE_MARGIN_BPS-TARGET_MARGIN_BPS;
  return {basis:'all-issued-points-spent',allowsOverdraft:true,excludesOverdraftRisk:true,outstandingDebtUnits:store.db.prepare('SELECT COALESCE(SUM(units),0) AS n FROM ai_points_debts').get().n,pointsPerCny:100,serviceMultiplier:10000/(10000-SERVICE_MARGIN_BPS),operatingReserveBps:reserveBps,
    free:{dailyPoints:checkIn.dailyPoints.free,cost30DaysMicros:pointLiabilityMicros(checkIn.dailyPoints.free*30*POINT_SCALE)},
    plans:Object.entries(plans).map(([id,plan])=>({id,name:plan.name,priceCents:plan.priceCents,dailyPoints:plan.dailyPoints,
      scenarios:[30,31].map(claimDays=>{const revenueMicros=plan.priceCents*10000,aiCostCeilingMicros=pointLiabilityMicros(plan.dailyPoints*claimDays*POINT_SCALE),reserveMicros=Math.ceil(revenueMicros*reserveBps/10000);
        return {claimDays,aiCostCeilingMicros,operatingReserveMicros:reserveMicros,remainingMarginBps:Math.round((revenueMicros-aiCostCeilingMicros-reserveMicros)*10000/revenueMicros)};})})),
    notice:'情景测算，不是已实现利润，也不是允许透支后的总费用上限；未收回欠分存在额外成本风险，欠分不计作现金收入。按全部签到积分用完计算。30天会员周期可能跨31个自然日，另列31次签到。服务器、手续费、税费、退款和异常失败成本以实际账单另行核对。'};
}
function priceMetadata(card) {
  return {priceBand:card.priceBand||'fixed',priceBandLabel:card.priceBand==='peak'?'高峰时段':card.priceBand==='off-peak'?'空闲时段':'管理员固定费率',
    priceSource:card.schedule==='deepseek-cn-2026'?pricingSource:'管理员确认费率',priceAppliedAt:card.appliedAt||null,
    ...(card.schedule==='deepseek-cn-2026'?{comparison:{peak:modelPointExamples({...card,...card.peakRates}),offPeak:modelPointExamples({...card,...card.offPeakRates})}}:{})};
}

export function pointServicePrices(store, now = Date.now()) {
  const managed = managedAiCandidates(store);
  const settings = managed ?? [authorAiSettings(store)].filter(Boolean);
  const models = [];
  for (const [index, setting] of settings.entries()) {
    if (!setting.keyCipher && !setting.apiKey) continue;
    try {
      const card = store.points.rateCard(setting);
      models.push({ id: setting.channelId || `configured-${index}`, kind: 'configured',
        name: setting.serviceName || setting.model, model: setting.model,
        priority: setting.priority ?? index + 1,
        verifiedAt: card.verifiedAt, expiresAt: card.expiresAt,
        ...modelPointExamples(card),...priceMetadata(card) });
    } catch (error) {
      if (!error.code?.startsWith('AI_POINTS_PRICING_')) throw error;
    }
  }
  const available = models.length > 0;
  if (!available) {
    try {
      const reference = officialRateAt(validRateCard(officialRateCards.find(card => card.model === 'deepseek-flash'), now),now);
      models.push({ id: 'reference-deepseek-flash', kind: 'reference', name: 'DeepSeek Flash（参考）',
        model: reference.model, priority: null, verifiedAt: reference.verifiedAt, expiresAt: reference.expiresAt,
        ...modelPointExamples(reference),...priceMetadata(reference) });
    } catch (error) {
      if (!error.code?.startsWith('AI_POINTS_PRICING_')) throw error;
    }
  }
  return { billingMode: 'actual-usage', scale: POINT_SCALE, pointsPerCny: 100,
    billingPolicy:{admission:'wallet-only',dailyCostLimitMicros:null,serviceMarginBps:SERVICE_MARGIN_BPS,serviceMultiplier:10000/(10000-SERVICE_MARGIN_BPS),priceSource:pricingSource},
    available, primaryModelId: available ? models[0].id : null,
    generatedAt: new Date(now).toISOString(), models,
    assumptions: { inputTokensPerCall: sampleInputTokens, output: 'first-round-output-allowance',
      includesStandardReviews: true, includesRetries: false,
      notice: '下列为标准用量示例，不是固定价格、预计账单或预扣上限。每轮按1000输入Token及首轮输出额度计算；长题干、对话历史、重试和切换接口会改变实际扣费。成功按实际用量结算，失败退还该任务预扣。' },
    freeServices: [
      { id: 'bank', name: '普通题库练习、已有解析与课程', units: 0 },
      { id: 'cache', name: '读取已生成的缓存结果', units: 0 },
      { id: 'deterministic', name: '客观题 / 确定性判分', units: 0 },
      { id: 'location-study', name: '定位前置专项练习', units: 0 },
    ],
  };
}
