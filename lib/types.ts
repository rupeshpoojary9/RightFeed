export type Goal = {
  id: number;
  name: string;
  description: string;
  search_query: string;
  last_searched_at: string | null;
};

export type Source = {
  id: number;
  kind: "channel" | "feed";
  ref: string;
  title: string;
  trusted: number;
  blocked: number;
  last_fetched_at: string | null;
  last_error: string | null;
};

export type Video = {
  id: string;
  channel_id: string;
  channel_title: string;
  title: string;
  description: string;
  published_at: string | null;
  duration_sec: number | null;
  thumbnail: string | null;
  is_short: number;
  origin: string;
  origin_goal_id: number | null;
  status: "new" | "filtered" | "scored";
  filter_reason: string | null;
  score: number | null;
  score_reason: string | null;
  goal_id: number | null;
  summary: string | null;
  transcript: string | null;
  transcript_status: string | null;
  watch_later: number;
  completed_at: string | null;
  created_at: string;
};

export type Reading = {
  id: string;
  source_id: number;
  source_title: string;
  title: string;
  link: string;
  summary: string;
  kind: "article" | "podcast";
  published_at: string | null;
  status: "new" | "filtered" | "scored";
  filter_reason: string | null;
  score: number | null;
  score_reason: string | null;
  goal_id: number | null;
  done: number;
};

export type Summary = {
  tldr: string;
  key_points: string[];
  action_ideas: string[];
  based_on: "transcript" | "description";
};

export type QuizQuestion = {
  question: string;
  options: string[];
  answer_index: number;
  explanation: string;
};

export type Flashcard = {
  id: number;
  video_id: string | null;
  front: string;
  back: string;
  ease: number;
  interval_days: number;
  reps: number;
  due_day: string;
};

export type Action = {
  id: number;
  video_id: string | null;
  text: string;
  done: number;
  done_at: string | null;
  created_at: string;
};

export type Note = {
  id: number;
  video_id: string;
  ts_sec: number;
  text: string;
  created_at: string;
};
