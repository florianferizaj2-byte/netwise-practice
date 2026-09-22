export type AppTab =
  | 'today'
  | 'practice'
  | 'wrong'
  | 'exam'
  | 'community'
  | 'profile';

export type AuthMode = 'login' | 'register';

export type PracticeMode = 'sequential' | 'random';

export type PracticeSource = 'all' | 'wrong' | 'favorites';

export type PracticeSession = 'standard' | 'daily';

export type NavigationOptions = {
  practiceMode?: PracticeMode;
  practiceSession?: PracticeSession;
  practiceSource?: PracticeSource;
  practiceChapter?: string;
  practiceKnowledgePoint?: string;
};
