import { pairTurns, type TranscriptMessage } from "@/lib/live-score";

export type InterviewStage = NonNullable<TranscriptMessage["stage"]>;

export type ProgressStep = {
  delta: number;
  reason: string;
};

const APPLICATION = /^prijavljujem se za poziciju\b/i;
const MARKER = /^\s*\[(P|K|\d{1,2})\]\s*/i;
const CLOSING = /intervju je (gotov|završen|zavrsen)/i;

/** Skida oznaku faze ([P], [1]…, [K]) sa početka AI poruke. */
export function parseStageMarker(reply: string): {
  text: string;
  stage?: InterviewStage;
} {
  const match = MARKER.exec(reply);
  if (!match) {
    const text = reply.trim();
    return CLOSING.test(text) ? { text, stage: "done" } : { text };
  }
  const tag = match[1].toUpperCase();
  const stage: InterviewStage =
    tag === "P" ? "intro" : tag === "K" ? "done" : Number(tag);
  return { text: reply.slice(match[0].length).trim(), stage };
}

export function stageMarker(stage: InterviewStage) {
  if (stage === "intro") return "[P]";
  if (stage === "done") return "[K]";
  return `[${stage}]`;
}

// Jedan korak upoznavanja/provere + sva planirana tehnička pitanja.
function totalSteps(questionCount: number) {
  return 1 + Math.max(1, questionCount);
}

function answeredTurns(messages: TranscriptMessage[]) {
  return pairTurns(messages).filter(
    (pair) => !APPLICATION.test(pair.answer.trim()),
  ).length;
}

function lastAiIndex(messages: TranscriptMessage[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.sender === "ai" && message.kind !== "conduct") return index;
  }
  return -1;
}

function lastStage(messages: TranscriptMessage[]): InterviewStage | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.sender === "ai" && message.stage !== undefined) return message.stage;
  }
  return undefined;
}

/** Broj završenih koraka. Kad AI postavlja pitanje k, gotovo je upoznavanje + k-1 pitanja. */
function completedSteps(messages: TranscriptMessage[], total: number) {
  const stage = lastStage(messages);
  if (stage === undefined) return Math.min(total, answeredTurns(messages));
  if (stage === "intro") return 0;
  if (stage === "done") return total;
  return Math.min(total - 1, Math.max(0, stage));
}

function percent(steps: number, total: number) {
  return Math.round((steps / total) * 100);
}

export function interviewProgressDetail(
  messages: TranscriptMessage[],
  questionCount: number,
) {
  const total = totalSteps(questionCount);
  const count = Math.max(1, questionCount);
  const done = completedSteps(messages, total);
  const progress = percent(done, total);
  const stage = lastStage(messages);
  const aiIndex = lastAiIndex(messages);

  if (aiIndex < 0 || (stage === undefined && done === 0)) {
    return { progress, last: null as ProgressStep | null };
  }

  const before = completedSteps(messages.slice(0, aiIndex), total);
  const delta = progress - percent(before, total);

  let reason: string;
  if (stage === undefined) {
    reason = done >= total ? "Sva pitanja odgovorena" : `Pitanje ${done} od ${total}`;
  } else if (stage === "intro") {
    reason = "Upoznavanje";
  } else if (stage === "done") {
    reason = "Intervju završen";
  } else if (delta === 0) {
    reason = `Pojašnjenje · pitanje ${stage} od ${count}`;
  } else {
    reason = `Pitanje ${stage} od ${count}`;
  }

  return { progress, last: { delta, reason } as ProgressStep | null };
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

  const stage = lastStage(messages);
  if (stage === undefined) {
    return answeredTurns(messages) >= totalSteps(questionCount);
  }
  return stage === "done";
}
