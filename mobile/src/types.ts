export type AppTab =
  | 'today'
  | 'practice'
  | 'wrong'
  | 'exam'
  | 'community'
  | 'profile';

export type AuthMode = 'login' | 'register';

export type PracticeMode = 'sequential' | 'random';

export type PracticeSource = 'all' | 'wrong';

export type NavigationOptions = {
  practiceMode?: PracticeMode;
  practiceSource?: PracticeSource;
};
