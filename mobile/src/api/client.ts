import { APP_VERSION } from '../version';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetch as streamingFetch } from 'expo/fetch';
import { ResourceCache, CacheCancelledError } from './resourceCache';
import { persistentStudyData, studyCachePolicy } from './cachePolicy';
import { ApiError, fetchJson } from './transport';
export { ApiError } from './transport';

export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ?? 'https://aceexam.top/api';

export type AppVersionResponse = {
  currentVersion: string;
  latestVersion: string;
  minimumVersion: string;
  downloadUrl: string;
  releaseNotes: string;
  updateAvailable: boolean;
  forceUpdate: boolean;
};

const SESSION_TOKEN_KEY = 'kaojiang-session-token';
const SESSION_PROFILE_KEY = 'kaojiang-session-profile';
let sessionToken: string | null = null;
let sessionRevision = 0;
let studyScope: string | null = null;
const streamControllers = new Set<AbortController>();
let sessionWrites: Promise<unknown> = Promise.resolve();
export const studyCache = new ResourceCache(
  AsyncStorage,
  studyCachePolicy,
  persistentStudyData,
);
const statusListeners = new Set<(status: 'expired' | 'update') => void>();

function writeSession(task: () => Promise<unknown>) {
  const pending = sessionWrites.then(task, task);
  sessionWrites = pending.catch(() => undefined);
  return sessionWrites;
}

export async function setSessionToken(token: string | null) {
  sessionToken = token;
  sessionRevision += 1;
  streamControllers.forEach((controller) => controller.abort());
  studyScope = null;
  void studyCache.setScope(null);
  if (!token) {
    statusListeners.forEach((listener) => listener('expired'));
  }
  await writeSession(async () => {
    if (token) {
      await AsyncStorage.removeItem(SESSION_PROFILE_KEY);
      await AsyncStorage.setItem(SESSION_TOKEN_KEY, token);
    } else {
      await AsyncStorage.multiRemove([SESSION_TOKEN_KEY, SESSION_PROFILE_KEY]);
    }
  });
}

export async function restoreSessionToken() {
  try {
    sessionToken = await AsyncStorage.getItem(SESSION_TOKEN_KEY);
  } catch {
    sessionToken = null;
  }
  return sessionToken;
}

export async function clearSessionToken() {
  await setSessionToken(null);
}

async function cacheSessionProfile(
  session: Pick<AuthResponse, 'user' | 'certificates'>,
) {
  const ready = activateStudyScope(session.user);
  const revision = sessionRevision;
  await ready;
  if (revision !== sessionRevision) throw new CacheCancelledError();
  await writeSession(async () => {
    if (revision !== sessionRevision) return;
    await AsyncStorage.setItem(
      SESSION_PROFILE_KEY,
      JSON.stringify({
        user: session.user,
        certificates: session.certificates,
      }),
    );
  });
  if (revision !== sessionRevision) throw new CacheCancelledError();
}

function activateStudyScope(user: AuthResponse['user']) {
  const next = JSON.stringify([
    API_BASE_URL,
    user.id,
    user.certificateId ?? '',
  ]);
  if (studyScope !== next) {
    studyScope = next;
    sessionRevision += 1;
    streamControllers.forEach((controller) => controller.abort());
  }
  return studyCache.setScope(next);
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const revision = sessionRevision;
  const token = sessionToken;
  let data: T;
  try {
    data = await fetchJson<T>(
      `${API_BASE_URL}${path}`,
      {
        ...init,
        credentials: 'omit',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'X-Client': 'mobile',
          'X-App-Version': APP_VERSION,
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...init.headers,
        },
      },
      path.startsWith('/ai/') ? 120000 : 30000,
    );
  } catch (error) {
    if (revision !== sessionRevision) throw new CacheCancelledError();
    if (error instanceof ApiError && error.status === 401 && token)
      void clearSessionToken();
    if (error instanceof ApiError && error.status === 426)
      statusListeners.forEach((listener) => listener('update'));
    throw error;
  }
  if (revision !== sessionRevision) throw new CacheCancelledError();
  if (init.method && init.method !== 'GET') {
    if (
      path === '/attempts' ||
      path.startsWith('/wrong/') ||
      path.endsWith('/favorite')
    ) {
      studyCache.invalidate([
        '/dashboard',
        '/practice/catalog',
        '/wrong',
        '/favorites',
        '/questions?',
      ]);
    } else if (path.endsWith('/submit') || path === '/ai/train') {
      studyCache.invalidate([
        '/practice/catalog',
        '/questions?',
        '/community/leaderboards',
      ]);
    }
  }
  return data;
}

function cachedRequest<T>(path: string, force = false) {
  return studyCache.read(path, (signal) => request<T>(path, { signal }), force);
}

export type AiStreamProgress = {
  stage?: string;
  message: string;
  outputLength?: number;
  round?: number;
};

async function streamRequest<T>(
  path: string,
  body: Record<string, unknown>,
  onProgress: (event: AiStreamProgress) => void,
): Promise<T> {
  const revision = sessionRevision;
  const controller = new AbortController();
  streamControllers.add(controller);
  const timer = setTimeout(() => controller.abort(), 240000);
  try {
    const response = await streamingFetch(`${API_BASE_URL}${path}`, {
      method: 'POST',
      credentials: 'omit',
      headers: {
        Accept: 'text/event-stream',
        'Content-Type': 'application/json',
        'X-Client': 'mobile',
        'X-App-Version': APP_VERSION,
        ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (revision !== sessionRevision) throw new CacheCancelledError();
    if (!response.ok) {
      const raw = await response.text();
      let message = `请求失败（${response.status}）`;
      try {
        message = JSON.parse(raw).error || message;
      } catch {
        /* Keep HTTP status. */
      }
      throw new ApiError(message, response.status, raw);
    }
    if (!response.body) throw new Error('服务器没有返回可读取的 AI 进度');
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let result: T | undefined;
    const consume = (record: string) => {
      if (revision !== sessionRevision) throw new CacheCancelledError();
      const data = record
        .split(/\r?\n/)
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trim())
        .join('\n');
      if (!data) return;
      const event = JSON.parse(data) as
        | ({ type: 'progress' } & AiStreamProgress)
        | { type: 'done'; result: T }
        | { type: 'error'; message: string };
      if (event.type === 'progress') onProgress(event);
      if (event.type === 'done') result = event.result;
      if (event.type === 'error') throw new Error(event.message);
    };
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (revision !== sessionRevision) throw new CacheCancelledError();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const records = buffer.split(/\r?\n\r?\n/);
        buffer = records.pop() || '';
        records.forEach(consume);
      }
      buffer += decoder.decode();
      if (buffer.trim()) consume(buffer);
    } finally {
      void reader.cancel().catch(() => undefined);
      reader.releaseLock();
    }
    if (result === undefined) throw new Error('AI 任务中断，请重试');
    studyCache.invalidate(['/practice/catalog', '/questions?']);
    return result;
  } catch (error) {
    if (revision !== sessionRevision) throw new CacheCancelledError();
    if (error instanceof ApiError && error.status === 401)
      void clearSessionToken();
    if (error instanceof ApiError && error.status === 426)
      statusListeners.forEach((listener) => listener('update'));
    if (controller.signal.aborted) throw new Error('AI 请求超时，请稍后重试');
    throw error;
  } finally {
    clearTimeout(timer);
    streamControllers.delete(controller);
  }
}

export type AuthResponse = {
  sessionToken?: string;
  user: {
    id: string;
    username: string;
    communityName?: string | null;
    certificateId?: string | null;
  };
  certificates: Array<{ id: string; name: string }>;
};

export type DashboardResponse = {
  todayCount: number;
  totalCount: number;
  accuracy: number | null;
  minutes: number;
  dueCount: number;
  wrongCount: number;
  streakDays?: number;
  recentDays?: Array<{ day: string; count: number }>;
  certificate?: { id: string; name: string } | null;
  user?: AuthResponse['user'] | null;
};

export type Question = {
  id: string;
  type: 'single_choice' | 'multiple_choice' | 'true_false' | 'short_answer';
  question: string;
  options: Record<string, string>;
  images?: Array<{ src: string; alt?: string; caption?: string }>;
  image?:
    string | Array<string | { src: string; alt?: string; caption?: string }>;
  sharedStem?: string;
  expectedAnswer?: string;
  chapter?: string;
  knowledgeSection?: string;
  knowledgePoint?: string;
  difficulty?: string;
  tags?: string[];
  answer?: string[];
  analysis?: string;
  wrongCount?: number;
  attempted?: boolean;
  favorite?: boolean;
  source?: string;
};

export type QuestionFilters = {
  chapter?: string;
  knowledgeSection?: string;
  knowledgePoint?: string;
};
export type QuestionPage = {
  items: Question[];
  total: number;
  nextOffset: number | null;
};

export type PracticeKnowledgePoint = {
  name: string;
  knowledgeSection?: string;
  questionCount: number;
  attemptedCount: number;
  progress: number;
};

export type PracticeCatalogSection = {
  name: string;
  questionCount: number;
  attemptedCount: number;
  progress: number;
  knowledgePoints: PracticeKnowledgePoint[];
};

export type PracticeCatalogChapter = {
  name: string;
  questionCount: number;
  attemptedCount: number;
  progress: number;
  knowledgePoints: PracticeKnowledgePoint[];
  sections?: PracticeCatalogSection[];
};

export type PracticeCatalogResponse = {
  total: number;
  attemptedCount: number;
  favoriteCount: number;
  chapters: PracticeCatalogChapter[];
};

export type AttemptResponse = {
  questionId: string;
  selected: string[];
  correct: boolean;
  timeMs: number;
  answer: string[];
  analysis?: string;
  expectedAnswer?: string;
};

export type AiQuestionDraft = {
  id: string;
  question: Question;
  checks: { rulesAndDuplicates: boolean; independentAiReview: boolean };
};

export type AiQuestionGenerationSelection = {
  chapter: string;
  knowledgeSection?: string;
  knowledgePoint: string;
};

export type AiQuestionGenerationJob = {
  id: string;
  selection: AiQuestionGenerationSelection;
  status: 'queued' | 'running' | 'completed' | 'failed';
  progress: AiStreamProgress & { completed?: number; total?: number; round?: number };
  groupId: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AiQuestionGroup = {
  id: string;
  certificateId: string;
  topic: string;
  harder: boolean;
  shared: boolean;
  groupType: 'training' | 'question_generation';
  metadata: AiQuestionGenerationSelection;
  createdAt: string;
  questionCount: number;
  completedCount: number;
};

export type AiQuestionGroupResponse = {
  group: AiQuestionGroup;
  questions: Question[];
};

export type LeaderboardEntry = {
  rank: number;
  userId: string;
  name: string;
  value: number;
  answered: number;
  correct: number;
};

export type LeaderboardResponse = {
  answered: { top: LeaderboardEntry[]; me: LeaderboardEntry | null };
  accuracy: { top: LeaderboardEntry[]; me: LeaderboardEntry | null };
  streakDays: { top: LeaderboardEntry[]; me: LeaderboardEntry | null };
  submitted: { top: LeaderboardEntry[]; me: LeaderboardEntry | null };
  accuracyMinAttempts: number;
};

export type FeedbackKind = 'wrong_answer' | 'ambiguous' | 'duplicate' | 'other';

export type AiAnalysisResponse = {
  mistakeType: string;
  weakKnowledge: string;
  reason: string;
};

export type AiTeacherAction =
  '详细讲解' | '换一种方法解释' | '举一个实际例子' | '给我提示';

export type AiTrainingResponse = {
  questions: Question[];
  cached: boolean;
};

export type AiSettingsResponse = {
  baseUrl: string;
  model: string;
  temperature: number;
  hasKey: boolean;
  encryptionReady: boolean;
  usage: {
    today: {
      calls: number;
      total_tokens: number;
    };
    total: {
      calls: number;
      prompt_tokens: number;
      completion_tokens: number;
      total_tokens: number;
      unknownUsage: number;
    };
  };
};

export type AiSettingsPayload = {
  baseUrl: string;
  model: string;
  temperature: number;
  apiKey?: string;
};

export type CommunityMessage = {
  id: string;
  userId: string;
  authorName: string;
  text: string;
  createdAt: string;
  imageUrl?: string;
  imageMime?: string;
  imageBytes?: number;
};

export type CommunityRoom = {
  id: 'global';
  name: string;
  description: string;
  memberCount: number;
  messageCount: number;
  storageUsedBytes: number;
  storageLimitBytes: number;
};

export type CommunityResponse = {
  room: CommunityRoom;
  messages: CommunityMessage[];
  hasMore: boolean;
  nextBefore: string | null;
};

export type CommunityImagePayload = {
  data: string;
  mimeType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
};

export const mobileApi = {
  onStatus(listener: (status: 'expired' | 'update') => void) {
    statusListeners.add(listener);
    return () => {
      statusListeners.delete(listener);
    };
  },

  clearStudyCache() {
    return studyCache.clear();
  },
  appVersion(version: string) {
    return request<AppVersionResponse>(
      `/mobile/version?version=${encodeURIComponent(version)}`,
    );
  },

  resolveDownloadUrl(url: string) {
    if (/^https?:\/\//i.test(url)) return url;
    const origin = API_BASE_URL.replace(/\/api\/?$/, '');
    return `${origin}${url.startsWith('/') ? url : `/${url}`}`;
  },

  async login(username: string, password: string) {
    const response = await request<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    await setSessionToken(response.sessionToken ?? null);
    await cacheSessionProfile(response);
    return response;
  },

  async register(username: string, password: string) {
    const response = await request<AuthResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    await setSessionToken(response.sessionToken ?? null);
    await cacheSessionProfile(response);
    return response;
  },

  me() {
    return request<{
      authenticated: boolean;
      user: AuthResponse['user'] | null;
      certificates: AuthResponse['certificates'];
    }>('/auth/me');
  },

  async restoreSession() {
    const token = await restoreSessionToken();
    if (!token) return { session: null, shouldValidate: false };

    try {
      const cached = await AsyncStorage.getItem(SESSION_PROFILE_KEY);
      if (cached) {
        const profile = JSON.parse(cached) as Pick<
          AuthResponse,
          'user' | 'certificates'
        >;
        if (profile.user?.id && Array.isArray(profile.certificates)) {
          await activateStudyScope(profile.user);
          return { session: profile, shouldValidate: true };
        }
      }
    } catch {
      // Validate the saved token if the cached profile is missing or malformed.
    }

    return { session: null, shouldValidate: true };
  },

  async refreshSession() {
    const revision = sessionRevision;
    try {
      const response = await this.me();
      if (!response.authenticated || !response.user) {
        await clearSessionToken();
        return null;
      }

      const refreshedSession = {
        user: response.user,
        certificates: response.certificates,
      } satisfies AuthResponse;
      await cacheSessionProfile(refreshedSession);
      return refreshedSession;
    } catch (error) {
      if (revision !== sessionRevision) throw new CacheCancelledError();
      if (error instanceof ApiError && [401, 403].includes(error.status)) {
        await clearSessionToken();
        return null;
      }
      throw error;
    }
  },

  cacheSession(session: AuthResponse) {
    return cacheSessionProfile(session);
  },

  async selectCertificate(certificateId: string) {
    const response = await request<{ user: AuthResponse['user'] }>(
      '/auth/certificate',
      {
        method: 'PUT',
        body: JSON.stringify({ certificateId }),
      },
    );
    await activateStudyScope(response.user);
    return response;
  },

  dashboard(force = false) {
    return cachedRequest<DashboardResponse>('/dashboard?summary=1', force);
  },

  questions(
    limit?: number,
    offset = 0,
    random = false,
    filters?: {
      chapter?: string;
      knowledgeSection?: string;
      knowledgePoint?: string;
    },
  ) {
    const params = new URLSearchParams();
    if (limit != null) params.set('limit', String(limit));
    if (offset) params.set('offset', String(offset));
    if (random) params.set('random', '1');
    if (filters?.chapter) params.set('chapter', filters.chapter);
    if (filters?.knowledgeSection)
      params.set('knowledgeSection', filters.knowledgeSection);
    if (filters?.knowledgePoint)
      params.set('knowledgePoint', filters.knowledgePoint);
    return random
      ? request<Question[]>(`/questions?${params.toString()}`)
      : cachedRequest<Question[]>(`/questions?${params.toString()}`);
  },

  questionPage(
    offset = 0,
    filters?: QuestionFilters,
    seed?: string,
    force = false,
  ) {
    const params = new URLSearchParams({
      page: '1',
      limit: '40',
      offset: String(offset),
    });
    for (const [key, value] of Object.entries(filters ?? {}))
      if (value) params.set(key, value);
    if (seed) {
      params.set('random', '1');
      params.set('seed', seed);
    }
    return cachedRequest<QuestionPage>(`/questions?${params}`, force);
  },

  practiceCatalog(force = false) {
    return cachedRequest<PracticeCatalogResponse>('/practice/catalog', force);
  },

  favorites(force = false) {
    return cachedRequest<Question[]>('/favorites', force);
  },

  wrong(force = false) {
    return cachedRequest<Question[]>('/wrong', force);
  },

  favorite(questionId: string, favorite: boolean) {
    return request<{ saved: boolean; favorite: boolean }>(
      `/questions/${encodeURIComponent(questionId)}/favorite`,
      {
        method: 'PUT',
        body: JSON.stringify({ favorite }),
      },
    );
  },

  removeWrong(questionId: string) {
    return request<{ deleted: boolean; questionId: string }>(
      `/wrong/${encodeURIComponent(questionId)}`,
      { method: 'DELETE' },
    );
  },

  recordAttempt(
    questionId: string,
    selected: string[],
    timeMs: number,
    response?: string,
  ) {
    return request<AttemptResponse>('/attempts', {
      method: 'POST',
      body: JSON.stringify({
        questionId,
        selected,
        timeMs,
        ...(response ? { response } : {}),
      }),
    });
  },

  feedback(questionId: string, kind: FeedbackKind, note?: string) {
    return request<{ saved: boolean }>(
      `/questions/${encodeURIComponent(questionId)}/feedback`,
      {
        method: 'POST',
        body: JSON.stringify({ kind, ...(note ? { note } : {}) }),
      },
    );
  },

  analyze(questionId: string) {
    return request<AiAnalysisResponse>('/ai/analyze', {
      method: 'POST',
      body: JSON.stringify({ questionId }),
    });
  },

  teacher(
    questionId: string,
    action: AiTeacherAction,
    selected: string[],
    hintLevel = 0,
  ) {
    return request<{ text: string }>('/ai/teacher', {
      method: 'POST',
      body: JSON.stringify({ questionId, action, selected, hintLevel }),
    });
  },

  train(questionId: string, count: 1 | 3 | 5 | 10 = 3, harder = false) {
    return request<AiTrainingResponse>('/ai/train', {
      method: 'POST',
      body: JSON.stringify({ questionId, count, harder }),
    });
  },

  trainStream(
    questionId: string,
    count: 1 | 3 | 5 | 10,
    onProgress: (event: AiStreamProgress) => void,
  ) {
    return streamRequest<AiTrainingResponse>(
      '/ai/train/stream',
      { questionId, count },
      onProgress,
    );
  },

  generateQuestionDraft(
    selection: {
      chapter: string;
      knowledgeSection?: string;
      knowledgePoint: string;
    },
    onProgress: (event: AiStreamProgress) => void,
  ) {
    return streamRequest<AiQuestionDraft>(
      '/ai/questions/draft/stream',
      selection,
      onProgress,
    );
  },

  currentQuestionDraft(selection: {
    chapter: string;
    knowledgeSection?: string;
    knowledgePoint: string;
  }) {
    const params = new URLSearchParams({
      chapter: selection.chapter,
      knowledgePoint: selection.knowledgePoint,
    });
    if (selection.knowledgeSection)
      params.set('knowledgeSection', selection.knowledgeSection);
    return request<{ draft: AiQuestionDraft | null }>(
      `/ai/questions/draft?${params.toString()}`,
    );
  },

  submitQuestionDraft(id: string) {
    return request<{ submitted: boolean; question: Question }>(
      `/ai/questions/draft/${encodeURIComponent(id)}/submit`,
      { method: 'POST', body: '{}' },
    );
  },

  deleteQuestionDraft(id: string) {
    return request<{ deleted: boolean }>(
      `/ai/questions/draft/${encodeURIComponent(id)}`,
      { method: 'DELETE' },
    );
  },

  createAiQuestionGeneration(selection: AiQuestionGenerationSelection) {
    return request<{ job: AiQuestionGenerationJob }>('/ai/questions/generations', {
      method: 'POST',
      body: JSON.stringify(selection),
    });
  },

  aiQuestionGenerationJobs() {
    return request<{ jobs: AiQuestionGenerationJob[] }>(
      '/ai/questions/generations',
    );
  },

  aiQuestionGenerationJob(id: string) {
    return request<{ job: AiQuestionGenerationJob }>(
      `/ai/questions/generations/${encodeURIComponent(id)}`,
    );
  },

  aiQuestionGroups() {
    return request<AiQuestionGroup[]>('/ai/groups');
  },

  aiQuestionGroup(id: string) {
    return request<AiQuestionGroupResponse>(
      `/ai/groups/${encodeURIComponent(id)}`,
    );
  },

  shareAiQuestionGroup(id: string, shared: boolean) {
    return request<{ saved: boolean; shared: boolean }>(
      `/ai/groups/${encodeURIComponent(id)}/share`,
      { method: 'PUT', body: JSON.stringify({ shared }) },
    );
  },

  invalidateGeneratedQuestionData() {
    studyCache.invalidate(['/practice/catalog', '/questions?']);
  },

  leaderboards() {
    return request<LeaderboardResponse>('/community/leaderboards');
  },

  communityMessages(before?: string, limit = 50, signal?: AbortSignal) {
    const params = new URLSearchParams({ limit: String(limit) });
    if (before) params.set('before', before);
    return request<CommunityResponse>(
      `/community/messages?${params.toString()}`,
      { signal },
    );
  },

  sendCommunityMessage(text: string, image?: CommunityImagePayload) {
    return request<{ room: CommunityRoom; message: CommunityMessage }>(
      '/community/messages',
      {
        method: 'POST',
        body: JSON.stringify({
          ...(text ? { text } : {}),
          ...(image ? { image } : {}),
        }),
      },
    );
  },

  updateCommunityProfile(name: string) {
    return request<{
      profile: { name: string; customized: boolean };
      user: AuthResponse['user'];
    }>('/community/profile', {
      method: 'PUT',
      body: JSON.stringify({ name }),
    });
  },

  communityImageUrl(imageUrl: string) {
    if (/^https?:\/\//i.test(imageUrl)) return imageUrl;
    return `${API_BASE_URL.replace(/\/api\/?$/, '')}${imageUrl}`;
  },

  settings() {
    return request<AiSettingsResponse>('/settings');
  },

  saveSettings(payload: AiSettingsPayload) {
    return request<{ saved: boolean }>('/settings', {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },

  deployAuthorApi(password: string) {
    return request<{
      deployed: boolean;
      baseUrl: string;
      model: string;
      temperature: number;
    }>('/settings/author-deploy', {
      method: 'POST',
      body: JSON.stringify({ password }),
    });
  },

  async logout() {
    // Capture the old token in the request, then detach it immediately. A delayed
    // logout must never delete credentials belonging to a subsequent login.
    const pending = request<{ loggedOut: boolean }>('/auth/logout', {
      method: 'POST',
    }).catch((error) => {
      if (!(error instanceof CacheCancelledError)) throw error;
      return { loggedOut: true };
    });
    // Attach a rejection handler immediately, even if storage is slow.
    void pending.catch(() => undefined);
    await clearSessionToken();
    return pending;
  },
};
