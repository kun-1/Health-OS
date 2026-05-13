export const recordTypes = [
  "meal",
  "supplement",
  "post_meal_symptom",
  "bowel",
  "water",
  "nosebleed",
  "daily_summary",
  "sleep"
] as const;

export type RecordType = (typeof recordTypes)[number];

export type TimelineRecord = {
  id: number;
  type: RecordType;
  occurred_at: string;
  payload: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type RecordsPage = {
  records: TimelineRecord[];
  nextCursor: string | null;
};
