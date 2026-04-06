export type CollectionMode = "OPEN" | "PAUSED" | "CLOSED";

export interface EventRecord {
  eventId: string;
  title: string;
  status: "LOCAL_ACTIVE";
}

export interface PromptRecord {
  promptId: string;
  title: string;
  description: string;
  createdAt: string;
}

export interface CollectionStateRecord {
  mode: CollectionMode;
  updatedAt: string;
}

export interface SubmissionRecord {
  submissionId: string;
  eventId: string;
  promptId: string;
  sessionId: string;
  answerText: string;
  clientRequestId: string;
  createdAt: string;
  deletedFlag: boolean;
}

export interface LocalEventState {
  event: EventRecord;
  prompts: PromptRecord[];
  activePromptId: string;
  collectionState: CollectionStateRecord;
  submissions: SubmissionRecord[];
}

export interface PublicBootstrapResponse {
  event: EventRecord;
  activePrompt: PromptRecord | null;
  collectionState: CollectionStateRecord;
}
