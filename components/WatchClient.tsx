"use client";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import {
  addAction,
  addNote,
  deleteNote,
  getQuiz,
  getSummary,
  makeCards,
  markCompleted,
  recordQuiz,
  setFeedback,
  startWatch,
  tickWatch,
  toggleAction,
  toggleWatchLater,
} from "@/app/actions";
import type { Action, Note, QuizQuestion, Summary } from "@/lib/types";
import Icon from "./Icons";

/* Minimal typing for the YouTube IFrame API */
type YTPlayer = {
  getCurrentTime(): number;
  seekTo(s: number, allowSeekAhead: boolean): void;
  playVideo(): void;
  pauseVideo(): void;
  destroy(): void;
};
declare global {
  interface Window {
    YT?: { Player: new (el: HTMLElement, opts: unknown) => YTPlayer; PlayerState: { PLAYING: number; ENDED: number } };
    onYouTubeIframeAPIReady?: () => void;
  }
}

function loadYouTubeApi(): Promise<void> {
  if (window.YT?.Player) return Promise.resolve();
  return new Promise((resolve) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve();
    };
    if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
      const s = document.createElement("script");
      s.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(s);
    }
  });
}

const fmt = (s: number) => {
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const ss = String(Math.floor(s % 60)).padStart(2, "0");
  return h ? `${h}:${String(m % 60).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
};

const INTENTS = [
  "Learn a specific skill",
  "Solve a problem I have right now",
  "Work toward one of my goals",
  "Prepare for something coming up",
  "A deliberate, chosen break",
];

type Tab = "summary" | "notes" | "quiz" | "act";

export default function WatchClient(props: {
  video: { id: string; title: string; completed: boolean };
  initialNotes: Note[];
  initialActions: Action[];
  initialSummary: Summary | null;
  initialFeedback: number;
  initialWatchLater: boolean;
  cardsCount: number;
  budget: { remaining: number; budget: number; locked: boolean };
  aiEnabled: boolean;
  startAt?: number;
  heading: React.ReactNode;
  owner: React.ReactNode;
  addToPath: React.ReactNode;
  details: React.ReactNode;
}) {
  const { video } = props;
  const [intent, setIntent] = useState("");
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [remaining, setRemaining] = useState(props.budget.remaining);
  const [locked, setLocked] = useState(props.budget.locked);
  const [completed, setCompleted] = useState(props.video.completed);
  const [tab, setTab] = useState<Tab>("summary");
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFb] = useState(props.initialFeedback);
  const [saved, setSaved] = useState(props.initialWatchLater);
  const hasBudget = props.budget.budget > 0;

  const playerEl = useRef<HTMLDivElement>(null);
  const player = useRef<YTPlayer | null>(null);
  const playing = useRef(false);
  const unsent = useRef(0);

  const flush = useCallback(async () => {
    if (!sessionId || unsent.current <= 0) return;
    const s = unsent.current;
    unsent.current = 0;
    const r = await tickWatch(sessionId, s);
    setRemaining(r.remaining);
    if (hasBudget && r.locked) {
      player.current?.pauseVideo();
      setLocked(true);
    }
  }, [sessionId, hasBudget]);

  // Create the player once the intent has been given.
  useEffect(() => {
    if (!sessionId || !playerEl.current) return;
    let cancelled = false;
    loadYouTubeApi().then(() => {
      if (cancelled || !playerEl.current || !window.YT) return;
      const YT = window.YT;
      player.current = new YT.Player(playerEl.current, {
        videoId: video.id,
        host: "https://www.youtube-nocookie.com",
        playerVars: { autoplay: 1, start: props.startAt || undefined, rel: 0, modestbranding: 1, iv_load_policy: 3, playsinline: 1 },
        events: {
          onStateChange: (e: { data: number }) => {
            playing.current = e.data === YT.PlayerState.PLAYING;
            if (e.data === YT.PlayerState.ENDED) {
              setCompleted(true);
              markCompleted(video.id);
              setTab("act");
              flush();
            }
          },
        },
      });
    });
    return () => {
      cancelled = true;
      player.current?.destroy();
      player.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, video.id]);

  // Count real playing time; report every 15s and when the tab is hidden.
  useEffect(() => {
    if (!sessionId) return;
    const t = setInterval(() => {
      if (!playing.current) return;
      unsent.current += 1;
      if (hasBudget) {
        setRemaining((r) => {
          const next = r - 1;
          if (next <= 0) {
            player.current?.pauseVideo();
            setLocked(true);
          }
          return Math.max(0, next);
        });
      }
      if (unsent.current >= 15) flush();
    }, 1000);
    const onHide = () => document.visibilityState === "hidden" && flush();
    document.addEventListener("visibilitychange", onHide);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onHide);
      flush();
    };
  }, [sessionId, flush, hasBudget]);

  const [starting, startTransition] = useTransition();
  const begin = (why: string) => {
    if (!why.trim()) return;
    startTransition(async () => {
      const r = await startWatch(video.id, why.trim());
      if (!r.ok) {
        setError(r.error);
        if (hasBudget) setLocked(true);
        return;
      }
      setSessionId(r.data.sessionId);
      setRemaining(r.data.remaining);
    });
  };

  const currentTime = () => player.current?.getCurrentTime() ?? 0;
  const seek = (s: number) => {
    player.current?.seekTo(s, true);
    player.current?.playVideo();
  };

  const rate = (value: 1 | -1) => {
    const v = feedback === value ? 0 : value;
    setFb(v);
    setFeedback(video.id, v as 0 | 1 | -1);
  };

  return (
    <div className="watch">
      <div>
      <div className="player">
        <div ref={playerEl} />
        {locked ? (
          <div className="overlay">
            <div className="box">
              <h2>Today&apos;s budget is used up</h2>
              <p>You set a limit of {Math.round(props.budget.budget / 60)} minutes a day, and you&apos;ve reached it. The best next step is to act on what you&apos;ve learned.</p>
              <div className="row" style={{ justifyContent: "center" }}>
                <button className="primary" onClick={() => setTab("act")}>Write an action step</button>
                <Link href="/review" className="btn">Review flashcards</Link>
              </div>
            </div>
          </div>
        ) : !sessionId ? (
          <div className="overlay">
            <form
              className="box"
              onSubmit={(e) => {
                e.preventDefault();
                begin(intent);
              }}
            >
              <h2>Why are you watching this?</h2>
              <p className="small" style={{ opacity: 0.8 }}>A moment of intent turns autopilot into a choice.</p>
              <div className="chips">
                {INTENTS.map((i) => (
                  <button key={i} type="button" onClick={() => setIntent(i)} disabled={starting}>{i}</button>
                ))}
              </div>
              <textarea
                value={intent}
                onChange={(e) => setIntent(e.target.value)}
                placeholder="e.g. I want to understand how compound interest works before I open my account"
                aria-label="Your reason for watching"
                style={{ minHeight: 70 }}
              />
              <div className="row" style={{ justifyContent: "center", marginTop: 10 }}>
                <button className="primary" disabled={!intent.trim() || starting}>{starting ? "Starting…" : "Start watching"}</button>
                <Link href="/" className="btn ghost">Not now</Link>
              </div>
              {hasBudget ? <p className="small" style={{ opacity: 0.7, marginTop: 10, marginBottom: 0 }}>{fmt(remaining)} of today&apos;s budget left</p> : null}
              {error ? <p className="small error">{error}</p> : null}
            </form>
          </div>
        ) : null}
      </div>

      {sessionId && hasBudget && !locked ? (
        <div className="intent">
          <span>Intent: “{intent}”</span>
          <span>{fmt(remaining)} left today</span>
        </div>
      ) : null}

      {props.heading}
      <div className="owner">
        {props.owner}
        <div className="row">
          <div className="segmented" title="Was this worth your time? Your ratings teach the AI judge what you find valuable.">
            <button aria-label="Worth my time" aria-pressed={feedback === 1} onClick={() => rate(1)}><Icon name="up" size={20} /></button>
            <button aria-label="Not worth my time" aria-pressed={feedback === -1} onClick={() => rate(-1)}><Icon name="down" size={20} /></button>
          </div>
          <button aria-pressed={saved} onClick={() => { setSaved((x) => !x); toggleWatchLater(video.id); }}>
            <Icon name="save" size={20} />
            {saved ? "Saved" : "Save"}
          </button>
          {props.addToPath}
          {completed ? (
            <span className="pill">Done</span>
          ) : (
            <button onClick={() => { setCompleted(true); markCompleted(video.id); }}>
              <Icon name="check" size={20} />
              Mark as done
            </button>
          )}
        </div>
      </div>
      {props.details}
      </div>

      <aside className="study" aria-label="Study this video">
        <div className="tabs" role="tablist">
          {(
            [
              ["summary", "Summary"],
              ["notes", "Notes"],
              ["quiz", "Quiz"],
              ["act", "Act on it"],
            ] as [Tab, string][]
          ).map(([k, label]) => (
            <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>
              {label}
            </button>
          ))}
        </div>
        <div hidden={tab !== "summary"}><SummaryTab videoId={video.id} initial={props.initialSummary} aiEnabled={props.aiEnabled} /></div>
        <div hidden={tab !== "notes"}><NotesTab videoId={video.id} initial={props.initialNotes} currentTime={currentTime} seek={seek} /></div>
        <div hidden={tab !== "quiz"}><QuizTab videoId={video.id} aiEnabled={props.aiEnabled} /></div>
        <div hidden={tab !== "act"}>
          <ActTab
            videoId={video.id}
            initialActions={props.initialActions}
            cardsCount={props.cardsCount}
            aiEnabled={props.aiEnabled}
          />
        </div>
      </aside>
    </div>
  );
}

/* -------------------------------- Summary -------------------------------- */

function SummaryTab({ videoId, initial, aiEnabled }: { videoId: string; initial: Summary | null; aiEnabled: boolean }) {
  const [summary, setSummary] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!aiEnabled && !summary) return <p className="small muted">Add an <code>ANTHROPIC_API_KEY</code> to get AI summaries.</p>;
  if (!summary) {
    return (
      <div>
        <p className="small muted">Read the key points first, then decide whether the full video is worth your time.</p>
        <button
          className="primary"
          disabled={pending}
          onClick={() =>
            start(async () => {
              setError(null);
              const r = await getSummary(videoId);
              if (r.ok) setSummary(r.data);
              else setError(r.error);
            })
          }
        >
          {pending ? "Reading the video…" : "Summarize"}
        </button>
        {error ? <p className="small" style={{ color: "var(--color-error)" }}>{error}</p> : null}
      </div>
    );
  }
  return (
    <div>
      <p>{summary.tldr}</p>
      <h3>Key points</h3>
      <ul className="clean">{summary.key_points.map((p, i) => <li key={i}>{p}</li>)}</ul>
      <p className="small muted" style={{ margin: 0 }}>
        {summary.based_on === "transcript" ? "Based on the full transcript." : "No transcript available, so this is based on the description only."}
      </p>
    </div>
  );
}

/* --------------------------------- Notes --------------------------------- */

function NotesTab({ videoId, initial, currentTime, seek }: { videoId: string; initial: Note[]; currentTime: () => number; seek: (s: number) => void }) {
  const [notes, setNotes] = useState(initial);
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  return (
    <div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const t = text;
          const ts = currentTime();
          setText("");
          start(async () => setNotes(await addNote(videoId, ts, t)));
        }}
      >
        <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Write an insight in your own words. It's saved at the current moment of the video." aria-label="New note" style={{ minHeight: 70 }} />
        <div className="row" style={{ marginTop: 6 }}>
          <button className="primary" disabled={!text.trim() || pending}>Save note at {fmt(currentTime())}</button>
        </div>
      </form>
      <div style={{ marginTop: 10 }}>
        {notes.length === 0 ? <p className="small muted">No notes yet. Writing things down helps you remember them.</p> : null}
        {notes.map((n) => (
          <div key={n.id} className="note">
            <button className="ts" onClick={() => seek(n.ts_sec)} title="Jump to this moment">{fmt(n.ts_sec)}</button>
            <div style={{ flex: 1, whiteSpace: "pre-wrap" }}>{n.text}</div>
            <button className="ghost small" aria-label="Delete note" onClick={() => start(async () => setNotes(await deleteNote(n.id, videoId)))}><Icon name="close" size={16} /></button>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------------------------- Quiz --------------------------------- */

function QuizTab({ videoId, aiEnabled }: { videoId: string; aiEnabled: boolean }) {
  const [qs, setQs] = useState<QuizQuestion[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [correct, setCorrect] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!aiEnabled) return <p className="small muted">Add an <code>ANTHROPIC_API_KEY</code> to get quizzes.</p>;
  if (!qs) {
    return (
      <div>
        <p className="small muted">3 quick questions after watching. Recalling ideas is what makes them stick.</p>
        <button
          className="primary"
          disabled={pending}
          onClick={() =>
            start(async () => {
              setError(null);
              const r = await getQuiz(videoId);
              if (r.ok && r.data.length) setQs(r.data);
              else setError(r.ok ? "No questions could be made for this video" : r.error);
            })
          }
        >
          {pending ? "Writing questions…" : "Take the quiz"}
        </button>
        {error ? <p className="small" style={{ color: "var(--color-error)" }}>{error}</p> : null}
      </div>
    );
  }
  if (idx >= qs.length) {
    return (
      <div className="empty" style={{ padding: 16 }}>
        <h2>{correct} / {qs.length}</h2>
        <p>{correct === qs.length ? "Excellent recall!" : correct > 0 ? "Good effort. Review the ones you missed." : "Worth a second look at the key points."}</p>
        <button onClick={() => { setIdx(0); setPicked(null); setCorrect(0); }}>Try again</button>
      </div>
    );
  }
  const q = qs[idx];
  return (
    <div>
      <div className="small muted">Question {idx + 1} of {qs.length}</div>
      <p style={{ fontWeight: 600 }}>{q.question}</p>
      {q.options.map((o, i) => (
        <button
          key={i}
          className={`quiz-opt${picked != null && i === q.answer_index ? " right" : ""}${picked === i && i !== q.answer_index ? " wrong" : ""}`}
          disabled={picked != null}
          onClick={() => {
            setPicked(i);
            if (i === q.answer_index) setCorrect((c) => c + 1);
          }}
        >
          {o}
        </button>
      ))}
      {picked != null ? (
        <div>
          <p className="small">{picked === q.answer_index ? "Correct. " : "Not quite. "}{q.explanation}</p>
          <button
            className="primary"
            onClick={() => {
              const next = idx + 1;
              if (next >= qs.length) recordQuiz(videoId, correct, qs.length);
              setIdx(next);
              setPicked(null);
            }}
          >
            {idx + 1 >= qs.length ? "See result" : "Next"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

/* ---------------------------------- Act ---------------------------------- */

function ActTab(props: {
  videoId: string;
  initialActions: Action[];
  cardsCount: number;
  aiEnabled: boolean;
}) {
  const [actions, setActions] = useState(props.initialActions);
  const [text, setText] = useState("");
  const [ideas, setIdeas] = useState<string[] | null>(null);
  const [cards, setCards] = useState(props.cardsCount);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const save = (t: string) => {
    if (!t.trim()) return;
    start(async () => {
      const id = await addAction(props.videoId, t);
      if (id == null) return;
      setActions((a) => [...a, { id, video_id: props.videoId, text: t.trim(), done: 0, done_at: null, created_at: new Date().toISOString() }]);
      setText("");
    });
  };

  return (
    <div className="stack">
      <div>
        <h3>What&apos;s one thing you&apos;ll do with this?</h3>
        <form className="inline-form" onSubmit={(e) => { e.preventDefault(); save(text); }}>
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Make it small and specific, e.g. “Try the 2-minute rule tomorrow morning”" aria-label="Action step" />
          <button className="primary" disabled={!text.trim() || pending}>Commit</button>
        </form>
        {props.aiEnabled ? (
          ideas ? (
            <div className="row" style={{ marginTop: 8 }}>
              {ideas.map((i) => <button key={i} className="small" onClick={() => setText(i)}>{i}</button>)}
            </div>
          ) : (
            <button className="ghost small" style={{ marginTop: 6 }} disabled={pending} onClick={() => start(async () => {
              const r = await getSummary(props.videoId);
              if (r.ok) setIdeas(r.data.action_ideas);
              else setMsg(r.error);
            })}>
              Suggest ideas
            </button>
          )
        ) : null}
        {actions.length ? (
          <ul className="clean" style={{ marginTop: 10 }}>
            {actions.map((a) => (
              <li key={a.id}>
                <label style={{ fontWeight: 400, display: "flex", gap: 8, alignItems: "center" }}>
                  <input type="checkbox" style={{ width: "auto" }} defaultChecked={Boolean(a.done)} onChange={() => toggleAction(a.id)} />
                  {a.text}
                </label>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div>
        <h3>Remember it</h3>
        <div className="row">
          {props.aiEnabled ? (
            <button disabled={pending} onClick={() => start(async () => {
              const r = await makeCards(props.videoId);
              if (r.ok) { setCards((c) => c + r.data); setMsg(`Added ${r.data} flashcards. They'll come back for review on a schedule.`); }
              else setMsg(r.error);
            })}>
              {pending ? "Working…" : "Make flashcards"}
            </button>
          ) : null}
          <Link href="/review" className="btn ghost">Review ({cards} from this video)</Link>
        </div>
        {msg ? <p className="small muted" style={{ marginTop: 6 }}>{msg}</p> : null}
      </div>

    </div>
  );
}
