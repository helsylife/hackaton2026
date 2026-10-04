import type { AnswerReview, TranscriptMessage } from "@/lib/live-score";

export type CandidateDecision = "pending" | "accepted" | "rejected";

export type CandidateRecord = {
  id: string;
  name: string;
  position: string;
  createdAt: number;
  updatedAt: number;
  axes: string[];
  scores: Record<string, number>;
  summary: string;
  anomaly: boolean;
  cv: string[];
  reviews: AnswerReview[];
  messages: TranscriptMessage[];
  decision: CandidateDecision;
};

export type CandidateStore = {
  activeId: string | null;
  list: CandidateRecord[];
};

const STORAGE_KEY = "bridge.candidates";
const EMPTY_STORE: CandidateStore = { activeId: null, list: [] };

const NAME_STOP = new Set([
  "mysql",
  "postgresql",
  "postgres",
  "python",
  "react",
  "node",
  "nodejs",
  "sql",
  "sqlalchemy",
  "ne",
  "da",
  "novac",
  "kako",
]);

function capitalize(word: string) {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

export function guessName(messages: TranscriptMessage[]) {
  const answers = messages
    .filter((message) => message.sender === "candidate")
    .map((message) => message.text.trim())
    .filter((text) => text && !/^prijavljujem se za poziciju\b/i.test(text));

  for (const text of answers) {
    const named = text.match(
      /(?:zovem se|ja sam|ime mi je|ja se zovem)\s+([A-Za-zČĆŽŠĐčćžšđ]{2,24})/i,
    );
    if (named?.[1]) return capitalize(named[1]);
  }

  const word = answers[0]?.split(/\s+/)[0]?.replace(/[.,!?:;]+$/g, "");
  if (
    word &&
    word.length >= 3 &&
    word.length <= 18 &&
    !NAME_STOP.has(word.toLowerCase()) &&
    !/\d/.test(word)
  ) {
    return capitalize(word);
  }

  return "Kandidat";
}

function isReview(value: unknown): value is AnswerReview {
  if (!value || typeof value !== "object") return false;
  const item = value as AnswerReview;
  return (
    typeof item.question === "string" &&
    typeof item.answer === "string" &&
    typeof item.opinion === "string"
  );
}

function isMessage(value: unknown): value is TranscriptMessage {
  if (!value || typeof value !== "object") return false;
  const item = value as TranscriptMessage;
  return (
    (item.sender === "ai" || item.sender === "candidate") &&
    typeof item.text === "string"
  );
}

function parseDecision(value: unknown): CandidateDecision {
  return value === "accepted" || value === "rejected" ? value : "pending";
}

function isRecord(value: unknown): value is CandidateRecord {
  if (!value || typeof value !== "object") return false;
  const item = value as CandidateRecord;
  return typeof item.id === "string" && typeof item.name === "string";
}

function parseCandidateStore(raw: string | null): CandidateStore {
  if (!raw) return EMPTY_STORE;

  try {
    const parsed = JSON.parse(raw) as Partial<CandidateStore>;
    const list = Array.isArray(parsed.list)
      ? parsed.list.filter(isRecord).map((item) => ({
          id: item.id,
          name: item.name || "Kandidat",
          position: item.position || "Pozicija",
          createdAt: item.createdAt || item.updatedAt || Date.now(),
          updatedAt: item.updatedAt || Date.now(),
          axes: Array.isArray(item.axes)
            ? item.axes.filter((axis): axis is string => typeof axis === "string")
            : [],
          scores:
            item.scores && typeof item.scores === "object" ? item.scores : {},
          summary: item.summary || "",
          anomaly: Boolean(item.anomaly),
          cv: Array.isArray(item.cv)
            ? item.cv.filter((entry): entry is string => typeof entry === "string")
            : [],
          reviews: Array.isArray(item.reviews) ? item.reviews.filter(isReview) : [],
          messages: Array.isArray(item.messages)
            ? item.messages.filter(isMessage)
            : [],
          decision: parseDecision(item.decision),
        }))
      : [];

    const activeId =
      typeof parsed.activeId === "string" &&
      list.some((item) => item.id === parsed.activeId)
        ? parsed.activeId
        : null;

    return { activeId, list };
  } catch {
    return EMPTY_STORE;
  }
}

let rosterCacheKey: string | null | undefined;
let rosterCache: CandidateStore = EMPTY_STORE;
const rosterListeners = new Set<() => void>();

export function getCandidateSnapshot(): CandidateStore {
  if (typeof window === "undefined") return EMPTY_STORE;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw === rosterCacheKey) return rosterCache;
  rosterCacheKey = raw;
  rosterCache = parseCandidateStore(raw);
  return rosterCache;
}

export function getCandidateServerSnapshot(): CandidateStore {
  return EMPTY_STORE;
}

export function subscribeCandidates(listener: () => void) {
  rosterListeners.add(listener);
  return () => {
    rosterListeners.delete(listener);
  };
}

export function loadCandidateStore(): CandidateStore {
  return getCandidateSnapshot();
}

export function saveCandidateStore(store: CandidateStore) {
  const raw = JSON.stringify(store);
  window.localStorage.setItem(STORAGE_KEY, raw);
  rosterCacheKey = raw;
  rosterCache = store;
  rosterListeners.forEach((listener) => listener());
}
