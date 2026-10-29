import type { Question, AttemptResponse } from "./client";
export type AiLearningStrategy = "weakness" | "challenge" | "review" | "balanced";
export type AiLearningKind = "practice" | "exam";
export type AiLearningSetup = { strategy:AiLearningStrategy; count:10|20|30|50; kind:AiLearningKind; durationMinutes:number; pointIds:string[] };
export type AiLearningProfile = {
  certificateId:string;windowDays:number;revision:string;confidence:"supported"|"insufficient";
  stats:{answered:number;correct:number;wrong:number;accuracy:number|null;attemptCount:number;distinctLifetime:number;ambiguousRecords:number};
  strategies:Array<{id:AiLearningStrategy;title:string;description:string;icon:string}>;
  points:Array<{id:string;chapter:string;knowledgeSection:string;knowledgePoint:string;distinctAnswered:number;correct:number;wrong:number;
    recentCount:number;recentWrong:number;confidence:string;stable:boolean}>;
};
export type AiLearningBlueprint = {
  kind:AiLearningKind;strategy:AiLearningStrategy;targetCount:number;diagnostic:boolean;notice:string;weightBasis:string;
  reasons:Array<{pointId:string;chapter:string;knowledgePoint:string;confidence:string;evidence:string}>;
  slots:Array<{position:number;pointId:string;chapter:string;knowledgePoint:string;stage:string;difficulty:string}>;
};
export type AiLearningQuote = {
  blueprint:AiLearningBlueprint;profileRevision:string;
  pricing:{available:boolean;scale:number;sampleUnits:number|null;notice:string};
};
export type AiLearningSummary = {
  id:string;kind:AiLearningKind;status:"queued"|"running"|"blocked"|"completed"|"canceled";strategy:AiLearningStrategy;
  targetCount:number;readyCount:number;answeredCount:number;submitted:boolean;createdAt:string;error:string|null;
};
export type AiLearningJob = AiLearningSummary & {
  blueprint:AiLearningBlueprint;questions:Array<Question & {position:number}>;groupId:string;answers:Record<string,string[]>;answersVersion:number;
  eventId:number;startedAt:string|null;remainingMs:number|null;waiting:boolean;pricing:AiLearningQuote["pricing"];
  billing:{chargedUnits:number;heldUnits:number;scale:number};
  progress:{stage:string;position:number};retryable:boolean;errorCode:string|null;
  result:{score:number;maxScore:number;targetCount:number;partial:boolean;elapsed:number;notice:string;results:Array<Question & AttemptResponse>}|null;
};
export type AiLearningEvent = {id:number;type:string;data:Record<string,unknown>};
