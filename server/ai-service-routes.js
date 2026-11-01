import { z } from "zod";
import { randomUUID } from "node:crypto";
import { encrypt, validateBaseUrl, masterKey, redact } from "./security.js";
import { authorAiSettings, legacyAuthorAiSettings } from "./ai-service.js";
import { aiServiceCatalog } from "./ai-service-catalog.js";
import {
  cnyMicros,
  tokenCost,
  chargeUnits,
  SERVICE_MARGIN_BPS,
} from "./ai-points/money.js";
const fail = (message, status = 400) => {
  throw Object.assign(new Error(message), { status });
};
const version = z.number().int().min(0),
  amount = z.string().regex(/^(0|[1-9]\d{0,8})(\.\d{1,6})?$/);
const price = z
  .object({
    input: amount,
    output: amount,
    cached: amount,
    source: z.string().trim().min(8).max(1000),
    expiresAt: z.string().datetime(),
    confirmed: z.literal(true),
    simpleTokenBilling: z.literal(true),
  })
  .strict();
const channelSchema = z
  .object({
    revision: version,
    name: z.string().trim().min(1).max(80),
    vendor: z.enum(aiServiceCatalog.map((row) => row.id)),
    baseUrl: z.string().url().max(1000),
    model: z.string().trim().min(1).max(200),
    temperature: z.number().min(0).max(2),
    priority: z.number().int().min(1).max(9999),
    enabled: z.boolean(),
    apiKey: z.string().trim().min(1).max(4096).optional(),
    clearKey: z.boolean().default(false),
    streamUsage: z.enum(["include", "native", "non-stream"]),
    requestMode: z.enum(["standard", "qwen-no-thinking", "thinking-disabled"]),
    price: price.optional(),
  })
  .strict();
export function registerAiServiceRoutes({
  route,
  store,
  provider,
  requireAdmin,
  ai,
}) {
  const services = store.aiServices;
  const safe = (row) => {
    const { keyCipher, ...data } = row;
    let card = null,
      pricingError = "";
    try {
      card = store.points.rateCard(row);
    } catch (error) {
      pricingError = error.message;
    }
    const sample = card
      ? tokenCost({ prompt_tokens: 1000, completion_tokens: 1000 }, card)
      : null;
    return {
      ...data,
      hasKey: !!keyCipher,
      ready: !!keyCipher && !!card,
      price: card
        ? {
            input: String(card.inputMicrosPerMillion / 1000000),
            output: String(card.outputMicrosPerMillion / 1000000),
            cached: String(card.cachedMicrosPerMillion / 1000000),
            source: card.source,
            expiresAt: card.expiresAt,
            verifiedAt: card.verifiedAt,
          }
        : null,
      pricingError,
      sampleCostCny: sample === null ? null : sample / 1000000,
      samplePoints:
        sample === null ? null : chargeUnits(sample, SERVICE_MARGIN_BPS) / 1000,
    };
  };
  const view = () => {
    const policy = services.policy(),
      current = authorAiSettings(store),
      legacy = legacyAuthorAiSettings(store);
    let encryptionReady = true;
    try {
      masterKey();
    } catch {
      encryptionReady = false;
    }
    return {
      ...policy,
      managed: !!policy.managed,
      channels: services.channels().map(safe),
      catalog: aiServiceCatalog,
      encryptionReady,
      selected: current
        ? {
            id: current.channelId || null,
            name: current.serviceName || "现有单接口配置",
            baseUrl: current.baseUrl,
            model: current.model,
          }
        : null,
      legacy: legacy
        ? {
            baseUrl: legacy.baseUrl,
            model: legacy.model,
            hasKey: !!(legacy.keyCipher || legacy.apiKey),
          }
        : null,
    };
  };
  const admin = (method, url, run) =>
    route(method, "/api/admin/ai-services" + url, (req) => {
      requireAdmin(req);
      return run(req);
    });
  const audit = (req, action, id, data) =>
    store.audit(req.user.id, action, "ai_service", id, data);
  admin("get", "", () => view());
  const save = (req, id) => {
    const body = channelSchema.parse(req.body),
      old = id ? services.get(id) : null;
    if (id && !old) fail("接口不存在", 404);
    if (!id && services.channels().length >= 100)
      fail("最多保存 100 个接口，请先移除不再使用的配置");
    if (body.apiKey && body.clearKey) fail("新密钥与清除密钥不能同时选择");
    let baseUrl;
    try {
      baseUrl = validateBaseUrl(body.baseUrl);
    } catch (error) {
      fail(error.message);
    }
    if (
      old?.keyCipher &&
      old.baseUrl !== baseUrl &&
      !body.apiKey &&
      !body.clearKey
    )
      fail(
        "服务地址改变时，请重新输入该服务的密钥，避免把旧密钥发送给其他接口",
      );
    const keyCipher = body.clearKey
      ? null
      : body.apiKey
        ? encrypt(body.apiKey)
        : old?.keyCipher || null;
    // K3 cache write/storage charges need an additional accounting dimension.
    if (/^(?:[^/]+\/)?kimi-k3(?:$|[-.])/i.test(body.model))
      fail(
        "Kimi K3 的额外缓存写入/存储计费尚未接入，请选择三项 Token 计价模型",
      );
    return store.points.transaction(() => {
      if (body.price) {
        const p = body.price;
        store.points.saveRateCard(
          {
            id: "channel-rate:" + cryptoId(),
            provider: baseUrl,
            model: body.model,
            inputMicrosPerMillion: cnyMicros(p.input),
            outputMicrosPerMillion: cnyMicros(p.output),
            cachedMicrosPerMillion: cnyMicros(p.cached),
            source: p.source,
            verifiedAt: new Date().toISOString(),
            expiresAt: p.expiresAt,
          },
          req.user.id,
        );
      }
      if (body.enabled) {
        if (!keyCipher) fail("启用前请保存密钥");
        store.points.rateCard({ baseUrl, model: body.model });
      }
      const data = {
        name: body.name,
        vendor: body.vendor,
        baseUrl,
        model: body.model,
        temperature: body.temperature,
        streamUsage: body.streamUsage,
        requestMode: body.requestMode,
        ...(old?.importedLegacy ? { importedLegacy: true } : {}),
      };
      const result = services.save({
        id,
        data,
        keyCipher,
        enabled: body.enabled,
        priority: body.priority,
        revision: body.revision,
        actor: req.user.id,
      });
      audit(req, "ai_service_saved", result.id, {
        name: body.name,
        model: body.model,
        baseUrl,
        priority: body.priority,
        enabled: body.enabled,
        keyChanged: !!body.apiKey || body.clearKey,
        priceChanged: !!body.price,
      });
      return view();
    });
  };
  admin("post", "/channels", (req) => save(req));
  admin("put", "/channels/:id", (req) => save(req, req.params.id));
  admin("post", "/policy", (req) => {
    const body = z
      .object({ revision: version, managed: z.boolean() })
      .strict()
      .parse(req.body);
    return store.points.transaction(() => {
      if (
        body.managed &&
        !services
          .channels()
          .map(safe)
          .some((row) => row.enabled && row.ready)
      )
        fail("请先启用至少一个密钥和价格均已就绪的接口");
      services.setManaged(body.managed, body.revision);
      audit(req, "ai_services_mode_changed", null, { managed: body.managed });
      return view();
    });
  });
  admin("post", "/order", (req) => {
    const body = z
      .object({ revision: version, ids: z.array(z.string().uuid()).max(100) })
      .strict()
      .parse(req.body);
    return store.points.transaction(() => {
      services.reorder(body.ids, body.revision, req.user.id);
      audit(req, "ai_services_reordered", null, { ids: body.ids });
      return view();
    });
  });
  admin("post", "/channels/:id/state", (req) => {
    const body = z
        .object({ revision: version, enabled: z.boolean() })
        .strict()
        .parse(req.body),
      row = services.get(req.params.id);
    if (!row) fail("接口不存在", 404);
    return store.points.transaction(() => {
      if (body.enabled && !safe(row).ready) fail("启用前请核对密钥和价格");
      services.setEnabled(row.id, body.enabled, body.revision, req.user.id);
      audit(req, "ai_service_state_changed", row.id, body);
      return view();
    });
  });
  admin("delete", "/channels/:id", (req) => {
    const body = z.object({ revision: version }).strict().parse(req.body);
    return store.points.transaction(() => {
      services.remove(req.params.id, body.revision);
      audit(req, "ai_service_deleted", req.params.id, {});
      return view();
    });
  });
  admin("post", "/import-legacy", (req) => {
    const body = z.object({ revision: version }).strict().parse(req.body),
      legacy = legacyAuthorAiSettings(store);
    if (!legacy) fail("尚无可复制的现有连接");
    if (services.channels().some((row) => row.importedLegacy)) return view();
    if (services.channels().length >= 100)
      fail("最多保存 100 个接口，请先移除不再使用的配置");
    return store.points.transaction(() => {
      services.save({
        data: {
          name: "现有 " + legacy.model,
          vendor: "custom",
          baseUrl: validateBaseUrl(legacy.baseUrl),
          model: legacy.model,
          temperature: legacy.temperature ?? 0.3,
          streamUsage: "include",
          requestMode: "standard",
          importedLegacy: true,
        },
        keyCipher: legacy.apiKey ? encrypt(legacy.apiKey) : legacy.keyCipher,
        enabled: false,
        priority: 100,
        revision: body.revision,
        actor: req.user.id,
      });
      audit(req, "ai_service_legacy_copied", null, { model: legacy.model });
      return view();
    });
  });
  admin("post", "/channels/:id/test", async (req) => {
    z.object({ confirmed: z.literal(true) })
      .strict()
      .parse(req.body);
    const row = services.get(req.params.id);
    if (!row) fail("接口不存在", 404);
    if (!safe(row).ready) fail("测试前请核对密钥和价格");
    try {
      await ai(req.user.id, () =>
        provider.call(
          [{ role: "user", content: "Reply with OK." }],
          { ...row, channelId: row.id, serviceName: row.name },
          {
            userId: req.user.id,
            taskType: "admin-connection-test",
            maxTokens: 256,
            disableThinking: true,
          },
        ),
      );
      services.recordTest(row.id, row.revision, {
        success: true,
        message: "连接成功，用量已计入当前管理员",
      });
      audit(req, "ai_service_tested", row.id, { success: true });
      return view();
    } catch (error) {
      services.recordTest(row.id, row.revision, {
        success: false,
        message: redact(error.message).slice(0, 250),
      });
      audit(req, "ai_service_tested", row.id, { success: false });
      throw error;
    }
  });
}
const cryptoId = randomUUID;
