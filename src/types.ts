export interface Phonogram {
  id: string; // e.g. "a"
  lesson: number; // 1 to 18
  sampleWords: string; // e.g. "cat, cane, all"
  imageUrl: string; // Host image
  audioUrl: string; // Host audio
}

export type CardStatus = 'Not Known' | 'Needs Work' | 'Known' | 'Remove';

export interface UserCardStatus {
  status: CardStatus;
  updatedAt: string | Date;
}

export interface PracticeSession {
  id: string;
  startTime: string;
  endTime: string;
  cardCount: number;
  results: Record<string, CardStatus>;
  score: number; // Percentage score (e.g., percentage of Known)
}
