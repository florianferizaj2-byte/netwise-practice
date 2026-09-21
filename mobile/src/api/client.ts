type JsonRecord = Record<string, unknown>;

export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ?? 'https://aceexam.top/api';

let sessionToken: string | null = null;

export function setSessionToken(token: string | null) {
  sessionToken = token;
}

export function clearSessionToken() {
  sessionToken = null;
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

export const mobileApi = {
  async login(username: string, password: string) {
    const response = await request<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    setSessionToken(response.sessionToken ?? null);
    return response;
  },

  async register(username: string, password: string) {
    const response = await request<AuthResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    setSessionToken(response.sessionToken ?? null);
    return response;
  },

  me() {
    return request<{
      authenticated: boolean;
      user: AuthResponse['user'] | null;
      certificates: AuthResponse['certificates'];
    }>('/auth/me');
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

  questions(limit = 10, offset = 0, random = false) {
    const params = new URLSearchParams({
      limit: String(limit),
      offset: String(offset),
    });
    if (random) params.set('random', '1');
    return request<Question[]>(`/questions?${params.toString()}`);
  },

  wrong() {
    return request<Question[]>('/wrong');
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

  logout() {
    const result = request<{ loggedOut: boolean }>('/auth/logout', {
      method: 'POST',
    });
    clearSessionToken();
    return result;
  },
};
