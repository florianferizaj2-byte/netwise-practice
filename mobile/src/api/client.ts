import { APP_VERSION } from '../version';
import AsyncStorage from '@react-native-async-storage/async-storage';

type JsonRecord = Record<string, unknown>;

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

export async function setSessionToken(token: string | null) {
  sessionToken = token;
  try {
    if (token) {
      await AsyncStorage.setItem(SESSION_TOKEN_KEY, token);
    } else {
      await AsyncStorage.multiRemove([SESSION_TOKEN_KEY, SESSION_PROFILE_KEY]);
    }
  } catch {
    // Keep the in-memory session usable if local storage is temporarily unavailable.
  }
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

async function cacheSessionProfile(session: Pick<AuthResponse, 'user' | 'certificates'>) {
  try {
    await AsyncStorage.setItem(
      SESSION_PROFILE_KEY,
      JSON.stringify({ user: session.user, certificates: session.certificates }),
    );
  } catch {
    // The network session remains usable if profile caching is unavailable.
  }
}

export class ApiError extends Error {
  status: number;
  data: unknown;

  constructor(message: string, status: number, data: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-Client': 'mobile',
      'X-App-Version': APP_VERSION,
      ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
      ...init.headers,
    },
  });

  const raw = await response.text();
  let data: unknown = null;
  try {
    data = raw ? (JSON.parse(raw) as unknown) : null;
  } catch {
    data = raw;
  }

  if (!response.ok) {
    const message =
      typeof data === 'object' && data !== null && 'error' in data
        ? String((data as JsonRecord).error)
        : `请求失败（${response.status}）`;
    throw new ApiError(message, response.status, data);
  }

  return data as T;
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
  recentDays?: Array<{ day: string; count: number }>;
  certificate?: { id: string; name: string } | null;
  user?: AuthResponse['user'] | null;
};

export type Question = {
  id: string;
  type: 'single_choice' | 'multiple_choice' | 'true_false';
  question: string;
  options: Record<string, string>;
  chapter?: string;
  knowledgePoint?: string;
  difficulty?: string;
  tags?: string[];
  answer?: string[];
  analysis?: string;
  wrongCount?: number;
  attempted?: boolean;
  favorite?: boolean;
};

export type PracticeKnowledgePoint = {
  name: string;
  questionCount: number;
  attemptedCount: number;
  progress: number;
};

export type PracticeCatalogChapter = {
  name: string;
  questionCount: number;
  attemptedCount: number;
  progress: number;
  knowledgePoints: PracticeKnowledgePoint[];
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
};

export type FeedbackKind =
  | 'wrong_answer'
  | 'ambiguous'
  | 'duplicate'
  | 'other';

export type AiAnalysisResponse = {
  mistakeType: string;
  weakKnowledge: string;
  reason: string;
};

export type AiTeacherAction =
  | '详细讲解'
  | '换一种方法解释'
  | '举一个实际例子'
  | '给我提示';

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
        const profile = JSON.parse(cached) as Pick<AuthResponse, 'user' | 'certificates'>;
        if (profile.user?.id && Array.isArray(profile.certificates)) {
          return { session: profile, shouldValidate: true };
        }
      }
    } catch {
      // Validate the saved token if the cached profile is missing or malformed.
    }

    return { session: null, shouldValidate: true };
  },

  async refreshSession() {
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

  selectCertificate(certificateId: string) {
    return request<{ user: AuthResponse['user'] }>('/auth/certificate', {
      method: 'PUT',
      body: JSON.stringify({ certificateId }),
    });
  },

  dashboard() {
    return request<DashboardResponse>('/dashboard');
  },

  questions(
    limit?: number,
    offset = 0,
    random = false,
    filters?: { chapter?: string; knowledgePoint?: string },
  ) {
    const params = new URLSearchParams();
    if (limit != null) params.set('limit', String(limit));
    if (offset) params.set('offset', String(offset));
    if (random) params.set('random', '1');
    if (filters?.chapter) params.set('chapter', filters.chapter);
    if (filters?.knowledgePoint) params.set('knowledgePoint', filters.knowledgePoint);
    return request<Question[]>(`/questions?${params.toString()}`);
  },

  practiceCatalog() {
    return request<PracticeCatalogResponse>('/practice/catalog');
  },

  favorites() {
    return request<Question[]>('/favorites');
  },

  wrong() {
    return request<Question[]>('/wrong');
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

  recordAttempt(questionId: string, selected: string[], timeMs: number) {
    return request<AttemptResponse>('/attempts', {
      method: 'POST',
      body: JSON.stringify({ questionId, selected, timeMs }),
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

  communityMessages(before?: string, limit = 50) {
    const params = new URLSearchParams({ limit: String(limit) });
    if (before) params.set('before', before);
    return request<CommunityResponse>(`/community/messages?${params.toString()}`);
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
    try {
      return await request<{ loggedOut: boolean }>('/auth/logout', {
        method: 'POST',
      });
    } finally {
      await clearSessionToken();
    }
  },
};
