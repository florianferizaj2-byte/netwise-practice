import type { Question } from "./client";
export type LocationLearningPoint = {
  id: string;
  name: string;
  chapter: string;
  section: string;
  questionCount: number;
  eligible: boolean;
};
export type LocationLearningSession = {
  id: string;
  version: number;
  day: string;
  state: "active" | "completed" | "abandoned" | "invalidated";
  point: LocationLearningPoint;
  pointIds?: string[];
  questions?: Question[];
  reviews?: { questionId: string; correct: boolean; selected: string[]; answer: string[]; analysis: string }[];
  completedCount: number;
  answeredCount: number;
  correctCount: number;
  total: number;
  phase: "answer" | "review";
  challenge: string;
  question: Question | null;
  feedback: {
    correct: boolean;
    selected: string[];
    answer: string[];
    analysis: string;
  } | null;
  activeMs: number;
  requiredMs: number;
  leaseId: string | null;
  sequence: number;
};
export type LocationLearningStatus = {
  userId: string;
  day: string;
  certificateId: string;
  unlocked: boolean;
  exemption?: string | null;
  remainingCount?: number;
  validUntil: string;
  policy: {
    count: number;
    answerMs: number;
    wrongReviewMs: number;
    pulseIntervalMs: number;
  };
  session: LocationLearningSession | null;
  points?: LocationLearningPoint[];
};
export type LocationLearningCredentials = {
  apiBaseUrl: string;
  sessionToken: string;
  permit: string;
  appVersion: string;
};
