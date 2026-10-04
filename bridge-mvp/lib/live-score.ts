import { axesFor, type Campaign } from "@/lib/campaign";

export type TranscriptMessage = {
  sender: "ai" | "candidate";
  text: string;
  kind?: "conduct";
  /** Faza na koju se AI poruka odnosi: upoznavanje, redni broj pitanja ili kraj. */
  stage?: "intro" | "done" | number;
};

export type AnswerReview = {
  question: string;
  answer: string;
  opinion: string;
};

export type LiveScore = {
  scores: Record<string, number>;
  summary: string;
  anomaly: boolean;
  cv: string[];
  reviews: AnswerReview[];
};

const TECH =
  /\b(MySQL|PostgreSQL|Postgres|SQLAlchemy|Python|Node\.?js|React|Docker|Redis|MongoDB|SQL)\b/gi;

function clamp(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function pairTurns(messages: TranscriptMessage[]) {
  const pairs: { question: string; answer: string }[] = [];
  let question = "Prijava";

  for (const message of messages) {
    const text = message.text.trim();
    if (!text) continue;
    if (message.sender === "ai") {
      if (message.kind === "conduct") continue;
      question = text;
      continue;
    }
    pairs.push({ question, answer: text });
  }

  return pairs;
}

function localOpinion(answer: string) {
  const text = answer.trim();
  if (/^prijavljujem se za poziciju/i.test(text)) {
    return "Prijava je zabeležena. Još nema sadržaja za ocenu.";
  }
  if (text.length > 220) {
    return "Pasus je dugačak i udžbenički. Ton odskače od kraćih odgovora, pa deluje prepisano ili generisano.";
  }
  if (/ne znam|nije mi jasno|kako misli/i.test(text)) {
    return "Otvoreno kaže da ne zna ili ne razume pitanje. Iskreno, ali signal znanja je slab.";
  }
  if (/novac|kad se zavr|koliko još|koliko jos/i.test(text)) {
    return "Motivacija deluje transakciono ili nestrpljivo. Slab signal da bi izdržao duži zadatak.";
  }
  if (/papir i olovk/i.test(text)) {
    return "Navodi sopstveni način rada. Konkretan signal stila, nije generičan odgovor.";
  }
  if (text.split(/\s+/).length <= 3) {
    return "Odgovor je prekratak. Imenuje temu, ali nema primer ni obrazloženje.";
  }
  return "Odgovor daje upotrebljiv signal i može da uđe u CV kao navedeno iskustvo.";
}

function sameAnswer(hint: string | undefined, answer: string) {
  const trimmed = hint?.trim();
  if (!trimmed) return false;
  const left = trimmed.slice(0, 48);
  const right = answer.slice(0, 48);
  return answer.includes(left) || trimmed.includes(right);
}

export function reviewsFor(
  messages: TranscriptMessage[],
  incoming?: { question?: string; answer?: string; opinion?: string }[],
): AnswerReview[] {
  return pairTurns(messages).map((pair, index) => {
    const indexedOpinion = incoming?.[index]?.opinion?.trim() ?? "";
    if (indexedOpinion) return { ...pair, opinion: indexedOpinion };

    const found = incoming?.find(
      (item) => Boolean(item?.opinion?.trim()) && sameAnswer(item?.answer, pair.answer),
    );
    return {
      ...pair,
      opinion: found?.opinion?.trim() || localOpinion(pair.answer),
    };
  });
}

export function fallbackScore(
  messages: TranscriptMessage[],
  campaign: Campaign | null,
): LiveScore {
  const axes = axesFor(campaign);
  const answers = messages
    .filter((message) => message.sender === "candidate")
    .map((message) => message.text.trim())
    .filter(Boolean);
  const joined = answers.join(" ");
  const formal = answers.some((answer) => answer.length > 220);
  const impatient = /novac|kad se zavr|koliko jos|koliko još/i.test(joined);
  const unsure = /ne znam|kako mislis|kako misliš/i.test(joined);
  const count = answers.length;

  const scores: Record<string, number> = {};
  for (const axis of axes) {
    let score = clamp(18 + count * 14);
    if (/iskren|autenti/i.test(axis) && formal) score = 32;
    if (/strplj|stres|stres/i.test(axis) && impatient) score = 28;
    if (/znanje|logika|apstrakt/i.test(axis) && unsure) score = 36;
    if (/samopouzdan/i.test(axis) && unsure) score = 34;
    scores[axis] = score;
  }

  const tools = [...new Set(joined.match(TECH) ?? [])];
  const cv = tools.slice(0, 4).map((tool) =>
    formal && /sqlalchemy/i.test(tool)
      ? `${tool} (Sumnjiv nivo znanja)`
      : tool,
  );
  if (/papir i olovk/i.test(joined)) cv.push("Rešavanje problema: papir i olovka");
  if (/kurs/i.test(joined)) cv.push("Edukacija: kursevi");

  const summary = formal
    ? "Stil odgovora osciluje. Kratke rečenice stoje pored dužeg, udžbeničkog pasusa, pa iskrenost deluje nisko."
    : count === 0
      ? "Još nema odgovora kandidata."
      : `Kandidat je dao ${count} ${count === 1 ? "odgovor" : "odgovora"}. Signal je još tanak i dopunjava se sledećim pitanjem.`;

  return {
    scores,
    summary,
    anomaly: formal,
    cv: cv.slice(0, 8),
    reviews: reviewsFor(messages),
  };
}

export function normalizeScore(
  raw: Partial<LiveScore> | null,
  campaign: Campaign | null,
  messages: TranscriptMessage[] = [],
): LiveScore | null {
  if (!raw || typeof raw.summary !== "string" || !raw.summary.trim()) {
    return null;
  }

  const axes = axesFor(campaign);
  const source = raw.scores ?? {};
  const scores: Record<string, number> = {};
  for (const axis of axes) {
    const value = source[axis];
    const numeric = typeof value === "number" ? value : Number(value);
    scores[axis] = Number.isFinite(numeric) ? clamp(numeric) : 0;
  }

  const cv = Array.isArray(raw.cv)
    ? raw.cv
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 8)
    : [];

  const anomaly =
    Boolean(raw.anomaly) || cv.some((item) => /sumnjiv/i.test(item));

  const incoming = Array.isArray(raw.reviews) ? raw.reviews : [];
  const reviews =
    messages.length > 0
      ? reviewsFor(messages, incoming)
      : incoming.flatMap((item) => {
          if (!item || typeof item.opinion !== "string" || typeof item.answer !== "string") {
            return [];
          }
          const opinion = item.opinion.trim();
          const answer = item.answer.trim();
          if (!opinion || !answer) return [];
          return [
            {
              question: item.question?.trim() || "Pitanje",
              answer,
              opinion,
            },
          ];
        });

  return {
    scores,
    summary: raw.summary.trim(),
    anomaly,
    cv,
    reviews,
  };
}
