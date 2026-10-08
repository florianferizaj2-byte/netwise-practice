export type StudyMastery = {
  attempted: number;
  correct: number;
  mastered: boolean;
};
export type StudyNode = {
  id: string;
  certificateId: string;
  code: string;
  name: string;
  chapter: string;
  section: string;
  scope: string;
  order: number;
  version: string;
  parentId: string | null;
  parentName: string | null;
  sublesson: { id: string; title: string; order: number; total: number } | null;
  available: boolean;
  packageId: string | null;
  completed: boolean;
  progressVersion: number;
  mastery: StudyMastery;
};
export type StudyCatalog = {
  access: boolean;
  supported: boolean;
  expiresAt?: string | null;
  nodes: StudyNode[];
};
export type StudyLesson = {
  node: StudyNode;
  packageId: string;
  questionCount: number;
  lesson: {
    title: string;
    summary: string;
    points: string[];
    example: string;
    pitfall: string;
  };
};
export type StudyQuestion = {
  id: string;
  stem: string;
  stage: "基础" | "理解" | "应用";
  blanks: Array<{
    id: string;
    label: string;
    kind: "term" | "number" | "ip" | "exact";
    unit: string;
  }>;
};
export type StudyAttempt = {
  id: string;
  questionId: string;
  answers: Record<string, string>;
  results: Array<{
    blankId: string;
    verdict: "correct" | "incorrect" | "uncertain";
    score: number;
    response: string;
    expectedAnswer: string;
    reason: string;
  }>;
  score: number;
  maxScore: number;
  correct: boolean;
  status: "graded" | "pending_review" | "processing";
  processing?: boolean;
  retryable?: boolean;
  explanation?: string;
  hint?: string;
  error?: string;
  reviewNote?: string;
};
export type StudySession = {
  id: string;
  nodeId: string;
  packageId: string;
  questions: StudyQuestion[];
  attempts: StudyAttempt[];
  mastery: StudyMastery;
};
export type StudyTeacherAnswer = {
  conclusion: string;
  points: string[];
  example: string;
};
export type StudyTeacherMessage = {
  question: string;
  answer: StudyTeacherAnswer;
};
export type StudyTeacherRequest = {
  nodeId: string;
  requestId: string;
  message: string;
  action: "ask" | "simple" | "example" | "hint";
  sessionId?: string;
  questionId?: string;
};

// Idempotency keys are reused until the corresponding user input changes.
export function studyRequestId() {
  return (
    globalThis.crypto?.randomUUID?.() ??
    "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (letter) => {
      const value = Math.floor(Math.random() * 16);
      return (letter === "x" ? value : (value & 3) | 8).toString(16);
    })
  );
}
export const studyNodeTitle = (node: StudyNode) =>
  node.sublesson?.title || node.name;
