import type { CandidateProfile } from "@/lib/candidate-profile";

export const TARGETS = [
  { id: "confidence", label: "Samopouzdanje" },
  { id: "abstraction", label: "Sposobnost apstraktnog razmišljanja" },
  { id: "honesty", label: "Iskrenost (Detekcija Copy-Paste)" },
  { id: "stress", label: "Otpornost na stres" },
] as const;

export type TargetId = (typeof TARGETS)[number]["id"];

export type TargetFlags = Record<TargetId, boolean>;

export type InterviewQuestion = {
  id: string;
  question: string;
  expected: string;
};

export type Campaign = {
  positionTitle: string;
  techStack: string;
  instructions: string;
  targets: TargetFlags;
  questions: InterviewQuestion[];
};

export const CAMPAIGN_AXES = [
  "Autentičnost (Iskrenost)",
  "Praktična Logika",
  "Strpljenje",
  "Domain Knowledge (MySQL)",
  "Kulturalni Fit",
] as const;

export const DEMO_INSTRUCTIONS =
  "Kandidat mora da pokaže praktično znanje. Uključi zamku za definiciju SQLAlchemy-ja. Očekujem da vidim autentičnost, a ne robotske odgovore. Meri nivo strpljenja ukoliko pitanja postanu ponavljajuća.";

export const DEMO_QUESTIONS: InterviewQuestion[] = [
  {
    id: "demo-name",
    question: "Ćao! Kako se zoveš i kojim bazama podataka se baviš?",
    expected:
      "Ime i konkretan sistem (MySQL, PostgreSQL ili slično). Odgovor bez sistema je slab signal.",
  },
  {
    id: "demo-mysql",
    question: "Koje su prednosti MySQL-a u odnosu na druge baze?",
    expected:
      "Praktično poređenje iz iskustva. 'Ne znam' bez pokušaja objašnjenja je nizak domen.",
  },
  {
    id: "demo-sqlalchemy",
    question: "Koje alate i biblioteke koristiš uz bazu?",
    expected:
      "Zamka za SQLAlchemy: svojim rečima. Udžbenička ili AI definicija je sumnjiva, ne autentična.",
  },
  {
    id: "demo-learning",
    question:
      "Kako učiš nešto novo i šta radiš kad zapneš na težem zadatku?",
    expected:
      "Konkretan proces. Vizuelno rešavanje, na primer papir i olovka, je validan signal stila.",
  },
  {
    id: "demo-motivation",
    question: "Šta te motiviše da radiš ovaj posao?",
    expected:
      "Ako je odgovor samo novac ili nestrpljenje, strpljenje je nisko, a motivacija transakciona.",
  },
];

export function draftQuestions(
  positionTitle: string,
  techStack: string,
): InterviewQuestion[] {
  const tech = techStack
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  const primary = tech[0] || "ovoj oblasti";
  const role = positionTitle.trim() || "ovu poziciju";
  const stamp = Date.now();

  return [
    {
      id: `draft-${stamp}-1`,
      question: `Koji konkretan posao ili projekat te najbolje kvalifikuje za ulogu ${role}?`,
      expected:
        "Jedan konkretan primer posla sa ulogom kandidata u njemu. Opšta biografija bez primera je slab signal.",
    },
    {
      id: `draft-${stamp}-2`,
      question: `Šta si konkretno radio sa ${primary}?`,
      expected: `Praktičan detalj o ${primary}. Udžbenička definicija bez iskustva je sumnjiva.`,
    },
    {
      id: `draft-${stamp}-3`,
      question: "Kako rešavaš problem kad zapneš i nemaš spreman odgovor?",
      expected:
        "Sopstveni proces, svojim rečima. Predugačak ili prepisani odgovor deluje neautentično.",
    },
    {
      id: `draft-${stamp}-4`,
      question: "Šta te drži da težak zadatak dovedeš do kraja?",
      expected:
        "Ako je motiv samo da se razgovor završi, ili isključivo novac, strpljenje je nisko.",
    },
  ];
}

const IDENTITY_QUESTION =
  /kako se zove[sš]|kako ti je ime|tvoje ime|reci (mi|nam) (nešto|nesto) o sebi|predstavi se|ko si ti|koliko ima[sš] godina(?! iskustva)|odakle si|gde (živiš|zivis)/i;

export function isIdentityQuestion(question: string) {
  return IDENTITY_QUESTION.test(question);
}

export function interviewQuestions(
  campaign: Campaign | null,
  profile: CandidateProfile | null,
): InterviewQuestion[] {
  const planned = (campaign?.questions ?? []).filter((item) =>
    item.question?.trim(),
  );
  if (!profile) return planned;
  return planned.filter((item) => !isIdentityQuestion(item.question));
}

const STORAGE_KEY = "bridge.campaign";

export const EMPTY_TARGETS: TargetFlags = {
  confidence: true,
  abstraction: true,
  honesty: true,
  stress: true,
};

export function axesFor(campaign: Campaign | null): string[] {
  if (!campaign?.targets) return [...CAMPAIGN_AXES];

  const axes: string[] = [];
  if (campaign.targets.honesty) axes.push("Iskrenost");
  if (campaign.targets.abstraction) axes.push("Apstraktno razmišljanje");
  if (campaign.targets.confidence) axes.push("Samopouzdanje");
  if (campaign.targets.stress) axes.push("Otpornost na stres");

  const stack = campaign.techStack
    .split(",")
    .map((part) => part.trim())
    .find(Boolean);
  if (stack) axes.push(`Znanje (${stack})`);

  return axes.length > 0 ? axes : [...CAMPAIGN_AXES];
}

export function activeTargets(campaign: Campaign | null): string[] {
  if (!campaign?.targets) return TARGETS.map((target) => target.label);
  return TARGETS.filter((target) => campaign.targets[target.id]).map(
    (target) => target.label,
  );
}

function isQuestion(value: unknown): value is InterviewQuestion {
  if (!value || typeof value !== "object") return false;
  const item = value as InterviewQuestion;
  return typeof item.question === "string" && typeof item.expected === "string";
}

function parseCampaign(raw: string | null): Campaign | null {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<Campaign>;
    if (typeof parsed.positionTitle !== "string") return null;

    return {
      positionTitle: parsed.positionTitle,
      techStack: parsed.techStack ?? "",
      instructions: parsed.instructions ?? "",
      targets: { ...EMPTY_TARGETS, ...parsed.targets },
      questions: Array.isArray(parsed.questions)
        ? parsed.questions.filter(isQuestion).map((item, index) => ({
            id: item.id || `q-${index}`,
            question: item.question,
            expected: item.expected,
          }))
        : [],
    };
  } catch {
    return null;
  }
}

let campaignCacheKey: string | null | undefined;
let campaignCache: Campaign | null = null;
const campaignListeners = new Set<() => void>();

export function getCampaignSnapshot(): Campaign | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw === campaignCacheKey) return campaignCache;
  campaignCacheKey = raw;
  campaignCache = parseCampaign(raw);
  return campaignCache;
}

export function getCampaignServerSnapshot(): Campaign | null {
  return null;
}

export function subscribeCampaign(listener: () => void) {
  campaignListeners.add(listener);
  return () => {
    campaignListeners.delete(listener);
  };
}

export function loadCampaign(): Campaign | null {
  return getCampaignSnapshot();
}

export function saveCampaign(campaign: Campaign) {
  const raw = JSON.stringify(campaign);
  window.localStorage.setItem(STORAGE_KEY, raw);
  campaignCacheKey = raw;
  campaignCache = campaign;
  campaignListeners.forEach((listener) => listener());
}
