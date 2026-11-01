export type AppTab =
  | 'today'
  | 'practice'
  | 'wrong'
  | 'ai'
  | 'exam'
  | 'vip'
  | 'profile';

export type AuthMode = 'login' | 'register';

export type PracticeMode = 'sequential' | 'random' | 'ai';

export type PracticeSource = 'all' | 'wrong' | 'favorites' | 'answered';

export type PracticeSession = 'standard' | 'daily';

export type NavigationOptions = {
  openAiExam?: boolean;
  practiceMode?: PracticeMode;
  practiceSession?: PracticeSession;
  practiceSource?: PracticeSource;
  practiceChapter?: string;
  practiceKnowledgeSection?: string;
  practiceKnowledgePoint?: string;
  practiceSelectionComplete?: boolean;
  practiceQuestionId?: string;
  practiceQuestionIds?: string[];
  practiceAiGroupId?: string;
  practiceAiLibrary?: boolean;
  aiQuestionGroupId?: string;
};
