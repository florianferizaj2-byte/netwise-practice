// These settings stay on the server. The requesting account still owns its
// usage, credits and generated questions; only the upstream connection is shared.
export function authorAiOwner(store, env = process.env) {
  const admins = store.allUsers().filter((user) => user.isAdmin && !user.bannedAt);
  if (env.AI_SERVICE_OWNER_ID?.trim())
    return admins.find((user) => user.id === env.AI_SERVICE_OWNER_ID.trim());
  if (env.ADMIN_USERNAME?.trim())
    return admins.find((user) => user.username === env.ADMIN_USERNAME.trim());
  return admins[0];
}

export function authorAiSettings(store, env = process.env) {
  const serviceKey = env.AI_SERVICE_API_KEY?.trim();
  const apiKey = serviceKey || env.AUTHOR_API_KEY?.trim();
  if (apiKey) {
    return {
      apiKey,
      baseUrl: (serviceKey ? env.AI_SERVICE_BASE_URL?.trim() : env.AUTHOR_API_BASE_URL?.trim()) || "https://api.deepseek.com",
      model: (serviceKey ? env.AI_SERVICE_MODEL?.trim() : env.AUTHOR_API_MODEL?.trim()) || "deepseek-chat",
      temperature: 0.3,
    };
  }
  const owner = authorAiOwner(store, env);
  if (!owner) {
    // Anonymous development instances have one local author profile.
    if (store.allUsers().length) return null;
    const local = store.settings("local");
    return local.keyCipher ? local : null;
  }
  const saved = store.settings(owner.id);
  if (saved.keyCipher) return saved;
  const admin = store.adminSettings(owner.id);
  return admin.keyCipher ? admin : null;
}

export function authorAiAvailable(store) {
  const settings = authorAiSettings(store);
  return !!(settings && (settings.apiKey || settings.keyCipher) && settings.baseUrl && settings.model);
}
