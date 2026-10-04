import { pairTurns, type TranscriptMessage } from "@/lib/live-score";

export type ProgressStep = {
  delta: number;
  reason: string;
};

const APPLICATION = /^prijavljujem se za poziciju\b/i;

function answeredTurns(messages: TranscriptMessage[]) {
  return pairTurns(messages).filter(
    (pair) => !APPLICATION.test(pair.answer.trim()),
  ).length;
}

// Jedna provera/upoznavanje + sva planirana tehnička pitanja.
function totalTurns(questionCount: number) {
  return 1 + Math.max(1, questionCount);
}

function percent(answered: number, total: number) {
  return Math.min(100, Math.round((answered / total) * 100));
}

export function interviewProgressDetail(
  messages: TranscriptMessage[],
  questionCount: number,
) {
  const total = totalTurns(questionCount);
  const answered = answeredTurns(messages);
  const progress = percent(answered, total);

  if (answered === 0) return { progress, answered, total, last: null };

  const delta = progress - percent(answered - 1, total);
  const reason =
    answered >= total
      ? "Sva pitanja odgovorena"
      : `Pitanje ${answered} od ${total}`;

  return { progress, answered, total, last: { delta, reason } as ProgressStep };
}

export function interviewProgressFor(
  messages: TranscriptMessage[],
  questionCount: number,
) {
  return interviewProgressDetail(messages, questionCount).progress;
}

export function interviewReadyToClose(
  messages: TranscriptMessage[],
  questionCount: number,
) {
  const last = [...messages].reverse().find((message) => message.kind !== "conduct");
  if (last?.sender !== "ai") return false;
  return answeredTurns(messages) >= totalTurns(questionCount);
}
