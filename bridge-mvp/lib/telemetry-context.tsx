"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  CAMPAIGN_AXES,
  EMPTY_TARGETS,
  axesFor,
  draftQuestions,
  getCampaignServerSnapshot,
  getCampaignSnapshot,
  interviewQuestions,
  loadCampaign,
  saveCampaign,
  subscribeCampaign,
  type Campaign,
} from "@/lib/campaign";
import {
  getCandidateServerSnapshot,
  getCandidateSnapshot,
  guessName,
  saveCandidateStore,
  subscribeCandidates,
  type CandidateDecision,
  type CandidateRecord,
  type CandidateStore,
} from "@/lib/candidates";
import { getSessionProfile } from "@/lib/candidate-account";
import type { CandidateProfile } from "@/lib/candidate-profile";
import type { OpenRole } from "@/lib/positions";
import {
  CONDUCT_EXCLUSION,
  CONDUCT_WARNING,
  hasOffensiveLanguage,
} from "@/lib/conduct";
import {
  fallbackScore,
  normalizeScore,
  reviewsFor,
  type LiveScore,
} from "@/lib/live-score";

export type SimulationStatus = "stabilno" | "incident" | "rešeno";

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export type Action = {
  name: string;
  timestamp: number;
  metadata: Record<string, JsonValue>;
};

export type ChatMessage = {
  sender: "ai" | "candidate";
  text: string;
  kind?: "conduct";
};

export type RadarScores = Record<string, number>;

const DEMO_SUMMARY =
  "UPOZORENJE SISTEMA: Otkrivena visoka oscilacija u stilu komunikacije. Kandidat koristi oskudan rečnik, ali je definicija za SQLAlchemy prekopirana iz udžbenika ili generisana od strane AI-ja. Kandidat preferira vizuelno rešavanje problema (papir i olovka). Nivo strpljenja je nizak, a motivacija isključivo transakciona (novac).";

export type TelemetryJson = {
  status: SimulationStatus;
  actions: Action[];
  startTime: number;
  campaignAxes: readonly string[];
  radar: RadarScores;
};

const EMPTY_MESSAGES: ChatMessage[] = [];

const EMPTY_RADAR: RadarScores = {
  "Autentičnost (Iskrenost)": 0,
  "Praktična Logika": 0,
  Strpljenje: 0,
  "Domain Knowledge (MySQL)": 0,
  "Kulturalni Fit": 0,
};

const DEMO_RADAR: RadarScores = {
  "Autentičnost (Iskrenost)": 35,
  "Praktična Logika": 70,
  Strpljenje: 30,
  "Domain Knowledge (MySQL)": 20,
  "Kulturalni Fit": 40,
};

const AI_QUESTIONS = [
  "Zdravo. Kako bi, svojim rečima, objasnio razliku između server i klijent komponente u Next.js-u?",
  "Kada bi delio sistem na mikroservise, po kom principu bi povukao granice?",
  "Primetiš da ti objašnjenje postaje dugačko. Kako ga sređuješ da ostane jasno?",
  "Koliko brzo donosiš zaključak kada nemaš sve podatke, i kako to kažeš naglas?",
  "Koje tehničke termine bi namerno upotrebio, a koje bi preveo na običan jezik?",
] as const;

const DEMO_CHAT: ChatMessage[] = [
  {
    sender: "ai",
    text: "Ćao! Kako se zoveš i kojim bazama podataka se baviš?",
  },
  { sender: "candidate", text: "Marjan baze podataka" },
  {
    sender: "ai",
    text: "Sjajno, Marjane. Možeš li malo konkretnije — šta tačno radiš sa bazama?",
  },
  { sender: "candidate", text: "kako mislis" },
  {
    sender: "ai",
    text: "Mislim konkretno koji sistem koristiš: MySQL, PostgreSQL, MongoDB ili nešto drugo?",
  },
  { sender: "candidate", text: "mysql" },
  {
    sender: "ai",
    text: "Odlično! Prednosti MySQL-a u odnosu na druge baze?",
  },
  {
    sender: "candidate",
    text: "ne znam iskreno, nikad nisam to poredio",
  },
  {
    sender: "ai",
    text: "Razumem. Alati i biblioteke koje koristiš uz bazu?",
  },
  {
    sender: "candidate",
    text: "SQLAlchemy: Apsolutni favorit kada je u pitanju objektno-relaciono mapiranje. Pruža elegantan ORM sloj, deklarativne modele, Unit of Work obrazac i fleksibilno komponovanje upita, uz mogućnost da se po potrebi spusti na čist SQL.",
  },
  {
    sender: "ai",
    text: "Odlično. Unapređenje znanja — kako učiš nešto novo?",
  },
  { sender: "candidate", text: "kroz kurseve kod cyssecora" },
  {
    sender: "ai",
    text: "Kad zapneš na težem zadatku, kako ga rešavaš?",
  },
  {
    sender: "candidate",
    text: "uzmem papir i olovku i ispišem korake dok ne vidim gde puca",
  },
  {
    sender: "ai",
    text: "Šta te motiviše da radiš ovaj posao?",
  },
  { sender: "candidate", text: "kad se zavrsava ovo" },
  {
    sender: "ai",
    text: "Još samo to: koja ti je motivacija?",
  },
  { sender: "candidate", text: "novac" },
];

const DEMO_OPINIONS = [
  "Ime je tu, ali oblast je neprecizna: nema sistema, uloge ni primera.",
  "Ne razume šta se traži. Artikulisanje je slabo.",
  "Imenuje MySQL bez ijedne prednosti ili iskustva.",
  "Iskreno priznaje da nije poredio baze. Domen je nizak, autentičnost viša.",
  "Definicija zvuči kao udžbenik ili AI tekst. Raskorak sa kratkim odgovorima pre toga.",
  "Navodi kurseve, bez toga šta je sam uradio.",
  "Konkretan, ličan proces. Jak signal kako zapravo razmišlja.",
  "Nestrpljenje. Fokus je na kraju razgovora, ne na zadatku.",
  "Motivacija je isključivo transakciona.",
];

const DEMO_CV = [
  "MySQL",
  "SQLAlchemy (Sumnjiv nivo znanja)",
  "Rešavanje problema: Papir i olovka",
  "Edukacija: Cyssecora kursevi",
];

const HERO_CHAT: ChatMessage[] = [
  {
    sender: "ai",
    text: "Zdravo Marko! Pročitao sam tvoj CV. Vidim da nemaš formalno IT obrazovanje, ali da si poslednje dve godine samostalno gradio full-stack aplikacije u Node.js-u i radio sa bazama. To je sjajno. Da li bi bio raspoložen da rešimo jedan praktičan arhitektonski problem u vezi sa bazama?",
  },
  { sender: "candidate", text: "Naravno, spreman sam." },
  {
    sender: "ai",
    text: "Odlično. Zamisli da imamo tabelu narudzbina sa 50 miliona redova koja se sporo učitava. Upit je SELECT * FROM narudzbine WHERE user_id = 123... Šta je tvoj prvi korak?",
  },
  {
    sender: "candidate",
    text: "S obzirom da nisam nikad u produkciji radio sa 50 miliona redova, ne bih napamet dodavao servere. Prvo bih iskoristio EXPLAIN ANALYZE da vidim da li nam fali kompozitni indeks na user_id i created_at.",
  },
];

const HERO_RADAR: RadarScores = {
  "Autentičnost (Iskrenost)": 92,
  "Praktična Logika": 94,
  Strpljenje: 78,
  "Domain Knowledge (MySQL)": 86,
  "Kulturalni Fit": 82,
};

const HERO_SUMMARY =
  "Hidden Gem: Kandidat nema formalno IT obrazovanje, ali je u razgovoru opravdao veštine iz CV-ja. Visoka iskrenost — sam kaže da nije radio sa ovom skalom u produkciji. Visoka praktična logika — prvo meri plan upita, ne dodaje servere napamet.";

const HERO_OPINIONS = [
  "Odmah prihvata praktičan zadatak. Nema okolišanja.",
  "Iskreno ograničava iskustvo i ne skalira napamet. Prvi korak je EXPLAIN ANALYZE i kompozitni indeks na user_id i created_at. Time opravdava veštine navedene u CV-ju.",
];

const HERO_CV = [
  "Self-taught, bez formalnog IT obrazovanja",
  "Node.js, full-stack (2 godine)",
  "SQL: EXPLAIN ANALYZE i kompozitni indeks",
];

type TelemetryContextValue = TelemetryJson & {
  chatMessages: ChatMessage[];
  generatedCV: string[];
  mindprint: string;
  anomaly: boolean;
  analyzingStats: boolean;
  campaign: Campaign | null;
  candidates: CandidateRecord[];
  activeCandidateId: string | null;
  trackAction: (name: string, metadata?: Record<string, JsonValue>) => void;
  triggerIncident: () => void;
  resolveIncident: () => void;
  autoFillDemo: () => void;
  autoFillHeroDemo: () => void;
  sendMessage: (text: string) => void;
  startNewCandidate: () => void;
  applyForPosition: (role: OpenRole) => void;
  publishCampaign: (campaign: Campaign) => "started" | "updated";
  setCandidateDecision: (id: string, decision: CandidateDecision) => void;
  deleteCandidate: (id: string) => void;
};

const TelemetryContext = createContext<TelemetryContextValue | null>(null);

function messagesForInterview(messages: ChatMessage[]) {
  const hidden = new Set<number>();
  messages.forEach((message, index) => {
    if (message.kind !== "conduct") return;
    hidden.add(index);
    if (messages[index - 1]?.sender === "candidate") hidden.add(index - 1);
  });
  return messages.filter((_, index) => !hidden.has(index));
}

async function requestInterviewReply(
  messages: ChatMessage[],
  campaign: Campaign | null,
  profile: CandidateProfile | null,
  fallback: () => string,
) {
  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: messagesForInterview(messages),
        campaign,
        profile,
      }),
    });

    if (response.status === 503) return fallback();
    if (!response.ok) {
      return "API nije odgovorio. Proveri OPENAI_API_KEY u .env.local i restartuj server.";
    }

    const data = (await response.json()) as { reply?: string };
    const reply = data.reply?.trim();
    return reply || fallback();
  } catch {
    return fallback();
  }
}

async function requestLiveScore(
  messages: ChatMessage[],
  campaign: Campaign | null,
  profile: CandidateProfile | null,
): Promise<LiveScore> {
  try {
    const response = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages, campaign, profile }),
    });
    if (!response.ok) return fallbackScore(messages, campaign);

    const data = (await response.json()) as Partial<LiveScore>;
    return normalizeScore(data, campaign, messages) ?? fallbackScore(messages, campaign);
  } catch {
    return fallbackScore(messages, campaign);
  }
}

export function TelemetryProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SimulationStatus>("stabilno");
  const [actions, setActions] = useState<Action[]>([]);
  const [startTime] = useState(() => Date.now());
  const [radar, setRadar] = useState<RadarScores>(EMPTY_RADAR);
  const [sessionMessages, setSessionMessages] = useState<ChatMessage[] | null>(null);
  const [generatedCV, setGeneratedCV] = useState<string[]>([]);
  const [mindprint, setMindprint] = useState("");
  const [anomaly, setAnomaly] = useState(false);
  const [analyzingStats, setAnalyzingStats] = useState(false);
  const [campaignOverride, setCampaignOverride] = useState<
    Campaign | null | undefined
  >(undefined);
  const [rosterOverride, setRosterOverride] = useState<CandidateStore | null>(null);
  const [axesOverride, setAxesOverride] = useState<string[] | null>(null);
  const storedCampaign = useSyncExternalStore(
    subscribeCampaign,
    getCampaignSnapshot,
    getCampaignServerSnapshot,
  );
  const storedRoster = useSyncExternalStore(
    subscribeCandidates,
    getCandidateSnapshot,
    getCandidateServerSnapshot,
  );
  const campaign =
    campaignOverride === undefined ? storedCampaign : campaignOverride;
  const roster = rosterOverride ?? storedRoster;
  const candidates = roster.list;
  const activeCandidateId = roster.activeId;
  const activeCandidate =
    candidates.find((item) => item.id === activeCandidateId) ?? null;
  const chatMessages = sessionMessages ?? activeCandidate?.messages ?? EMPTY_MESSAGES;
  const campaignAxes = useMemo(
    () => axesOverride ?? (campaign ? axesFor(campaign) : [...CAMPAIGN_AXES]),
    [axesOverride, campaign],
  );
  const questionIndex = useRef(0);
  const chatRef = useRef<ChatMessage[]>([]);
  const requestId = useRef(0);
  const analyzeId = useRef(0);
  const campaignRef = useRef<Campaign | null>(null);
  const candidatesRef = useRef<CandidateRecord[]>([]);
  const activeIdRef = useRef<string | null>(null);

  useEffect(() => {
    campaignRef.current = campaign;
    candidatesRef.current = candidates;
    activeIdRef.current = activeCandidateId;
    chatRef.current = chatMessages;
    if (sessionMessages === null) {
      questionIndex.current = chatMessages.filter(
        (message) => message.sender === "ai" && message.kind !== "conduct",
      ).length;
    }
  }, [campaign, candidates, activeCandidateId, chatMessages, sessionMessages]);

  const persistRoster = useCallback(
    (list: CandidateRecord[], activeId: string | null) => {
      const next = { activeId, list };
      candidatesRef.current = list;
      activeIdRef.current = activeId;
      setRosterOverride(next);
      saveCandidateStore(next);
    },
    [],
  );

  const upsertCandidate = useCallback(
    (
      messages: ChatMessage[],
      score: LiveScore,
      axes: string[],
      forcedId?: string,
    ) => {
      const hasAnswer = messages.some(
        (message) => message.sender === "candidate" && message.text.trim(),
      );
      if (!hasAnswer) return;

      const id =
        forcedId ?? activeIdRef.current ?? `cand-${Date.now().toString(36)}`;
      const prev = candidatesRef.current.find((item) => item.id === id);
      const titled = campaignRef.current?.positionTitle.trim();
      const record: CandidateRecord = {
        id,
        name:
          id === "demo-marko"
            ? "Marko"
            : forcedId
              ? guessName(messages)
              : getSessionProfile()?.fullName.trim() || guessName(messages),
        position:
          titled ||
          prev?.position ||
          (id === "demo-marjan"
            ? "Database Administrator"
            : id === "demo-marko"
              ? "Full-stack Developer"
              : "Pozicija"),
        createdAt: prev?.createdAt ?? Date.now(),
        updatedAt: Date.now(),
        axes,
        scores: score.scores,
        summary: score.summary,
        anomaly: score.anomaly,
        cv: score.cv,
        reviews: score.reviews,
        messages,
        decision: prev?.decision ?? "pending",
      };
      const list = [
        record,
        ...candidatesRef.current.filter((item) => item.id !== id),
      ].sort((a, b) => b.updatedAt - a.updatedAt);
      persistRoster(list, id);
    },
    [persistRoster],
  );

  const applyScore = useCallback(
    (score: LiveScore, axes: string[]) => {
      setAxesOverride(axes);
      setRadar(score.scores);
      setMindprint(score.summary);
      setAnomaly(score.anomaly);
      setGeneratedCV(score.cv);
      upsertCandidate(chatRef.current, score, axes);
    },
    [upsertCandidate],
  );

  const trackAction = useCallback(
    (name: string, metadata: Record<string, JsonValue> = {}) => {
      setActions((current) => [
        ...current,
        { name, timestamp: Date.now(), metadata },
      ]);
    },
    [],
  );

  const triggerIncident = useCallback(() => {
    setStatus("incident");
  }, []);

  const resolveIncident = useCallback(() => {
    setStatus("rešeno");
  }, []);

  const sendMessage = useCallback((text: string) => {
    if (
      chatRef.current.some(
        (message) => message.kind === "conduct" && message.text === CONDUCT_EXCLUSION,
      )
    ) {
      return;
    }

    if (!campaignRef.current) {
      campaignRef.current = loadCampaign();
      if (campaignRef.current) setCampaignOverride(campaignRef.current);
    }

    const activeCampaign = campaignRef.current;
    const history: ChatMessage[] = [
      ...chatRef.current,
      { sender: "candidate", text },
    ];

    if (hasOffensiveLanguage(text)) {
      requestId.current += 1;
      const kicked = chatRef.current.some((message) => message.kind === "conduct");
      const next: ChatMessage[] = [
        ...history,
        {
          sender: "ai",
          kind: "conduct",
          text: kicked ? CONDUCT_EXCLUSION : CONDUCT_WARNING,
        },
      ];
      chatRef.current = next;
      setSessionMessages(next);

      const scoreId = ++analyzeId.current;
      const axes = axesFor(activeCampaign);
      const profile = getSessionProfile();
      setAnalyzingStats(true);
      applyScore(fallbackScore(next, activeCampaign), axes);

      void (async () => {
        const score = await requestLiveScore(next, activeCampaign, profile);
        if (scoreId !== analyzeId.current) return;
        applyScore(score, axes);
        setAnalyzingStats(false);
      })();
      return;
    }

    chatRef.current = history;
    setSessionMessages(history);

    const id = ++requestId.current;
    const scoreId = ++analyzeId.current;
    const axes = axesFor(activeCampaign);
    const profile = getSessionProfile();
    setAnalyzingStats(true);
    applyScore(fallbackScore(history, activeCampaign), axes);

    void (async () => {
      const score = await requestLiveScore(history, activeCampaign, profile);
      if (scoreId !== analyzeId.current) return;
      applyScore(score, axes);
      setAnalyzingStats(false);
    })();

    void (async () => {
      const reply = await requestInterviewReply(history, activeCampaign, profile, () => {
        const asked = history.filter(
          (message) => message.sender === "ai" && message.kind !== "conduct",
        ).length;
        const planned = interviewQuestions(activeCampaign, profile)[asked];
        if (planned?.question.trim()) return planned.question.trim();

        const fallback =
          AI_QUESTIONS[questionIndex.current % AI_QUESTIONS.length];
        questionIndex.current += 1;
        return fallback;
      });

      if (id !== requestId.current) return;

      const next: ChatMessage[] = [
        ...chatRef.current,
        { sender: "ai", text: reply },
      ];
      chatRef.current = next;
      setSessionMessages(next);

      const activeId = activeIdRef.current;
      if (!activeId) return;
      const list = candidatesRef.current.map((item) =>
        item.id === activeId ? { ...item, messages: next } : item,
      );
      persistRoster(list, activeId);
    })();
  }, [applyScore, persistRoster]);

  const applyForPosition = useCallback(
    (role: OpenRole) => {
      const published = campaignRef.current ?? loadCampaign();
      const same =
        published != null &&
        published.positionTitle.trim().toLowerCase() ===
          role.title.trim().toLowerCase();
      const active: Campaign =
        same && published
          ? published
          : {
              positionTitle: role.title,
              techStack: role.stack,
              instructions: "",
              targets: { ...EMPTY_TARGETS },
              questions: draftQuestions(role.title, role.stack),
            };

      campaignRef.current = active;
      setCampaignOverride(active);
      setAxesOverride(axesFor(active));
      sendMessage(`Prijavljujem se za poziciju ${role.title}.`);
    },
    [sendMessage],
  );

  const clearLiveSession = useCallback(() => {
    requestId.current += 1;
    analyzeId.current += 1;
    questionIndex.current = 0;
    chatRef.current = [];
    setSessionMessages([]);
    setGeneratedCV([]);
    setMindprint("");
    setAnomaly(false);
    setAnalyzingStats(false);
    const axes = axesFor(campaignRef.current);
    setAxesOverride(axes);
    setRadar(Object.fromEntries(axes.map((axis) => [axis, 0])));
  }, []);

  const setCandidateDecision = useCallback(
    (id: string, decision: CandidateDecision) => {
      const list = candidatesRef.current.map((item) =>
        item.id === id ? { ...item, decision, updatedAt: Date.now() } : item,
      );
      persistRoster(list, activeIdRef.current);
    },
    [persistRoster],
  );

  const deleteCandidate = useCallback(
    (id: string) => {
      const list = candidatesRef.current.filter((item) => item.id !== id);
      const wasActive = activeIdRef.current === id;
      if (wasActive) clearLiveSession();
      persistRoster(list, wasActive ? null : activeIdRef.current);
    },
    [clearLiveSession, persistRoster],
  );

  const startNewCandidate = useCallback(() => {
    clearLiveSession();
    persistRoster(candidatesRef.current, null);
  }, [clearLiveSession, persistRoster]);

  const publishCampaign = useCallback(
    (next: Campaign) => {
      saveCampaign(next);
      campaignRef.current = next;
      setCampaignOverride(next);
      const axes = axesFor(next);
      setAxesOverride(axes);

      const candidateSpoke = chatRef.current.some(
        (message) => message.sender === "candidate",
      );
      if (candidateSpoke) {
        const scoreId = ++analyzeId.current;
        setAnalyzingStats(true);
        void (async () => {
          const score = await requestLiveScore(
            chatRef.current,
            next,
            getSessionProfile(),
          );
          if (scoreId !== analyzeId.current) return;
          applyScore(score, axes);
          setAnalyzingStats(false);
        })();
        return "updated" as const;
      }

      setRadar(Object.fromEntries(axes.map((axis) => [axis, 0])));
      setMindprint("");
      setGeneratedCV([]);
      setAnomaly(false);
      setAnalyzingStats(false);
      return "started" as const;
    },
    [applyScore],
  );

  const autoFillDemo = useCallback(() => {
    const now = Date.now();
    const demoActions: Action[] = [
      {
        name: "analiza_zahteva",
        timestamp: now - 12_000,
        metadata: { izvor: "demo", korak: 1 },
      },
      {
        name: "generisanje_koda",
        timestamp: now - 8_000,
        metadata: { izvor: "demo", korak: 2, model: "bridge" },
      },
      {
        name: "detekcija_incidenta",
        timestamp: now - 4_000,
        metadata: { izvor: "demo", korak: 3, tip: "regresija" },
      },
      {
        name: "revizija_arhitekture",
        timestamp: now,
        metadata: { izvor: "demo", korak: 4, ishod: "prihvaćeno" },
      },
    ];

    requestId.current += 1;
    analyzeId.current += 1;
    questionIndex.current = DEMO_CHAT.filter(
      (message) => message.sender === "ai",
    ).length;
    chatRef.current = DEMO_CHAT;

    setActions(demoActions);
    setAxesOverride([...CAMPAIGN_AXES]);
    setRadar(DEMO_RADAR);
    setSessionMessages(DEMO_CHAT);
    setGeneratedCV(DEMO_CV);
    setMindprint(DEMO_SUMMARY);
    setAnomaly(true);
    setAnalyzingStats(false);
    upsertCandidate(
      DEMO_CHAT,
      {
        scores: DEMO_RADAR,
        summary: DEMO_SUMMARY,
        anomaly: true,
        cv: DEMO_CV,
        reviews: reviewsFor(
          DEMO_CHAT,
          DEMO_OPINIONS.map((opinion) => ({ opinion })),
        ),
      },
      [...CAMPAIGN_AXES],
      "demo-marjan",
    );
  }, [upsertCandidate]);

  const autoFillHeroDemo = useCallback(() => {
    const now = Date.now();
    const demoActions: Action[] = [
      {
        name: "analiza_zahteva",
        timestamp: now - 12_000,
        metadata: { izvor: "hero", korak: 1 },
      },
      {
        name: "generisanje_koda",
        timestamp: now - 8_000,
        metadata: { izvor: "hero", korak: 2, model: "bridge" },
      },
      {
        name: "detekcija_incidenta",
        timestamp: now - 4_000,
        metadata: { izvor: "hero", korak: 3, tip: "regresija" },
      },
      {
        name: "revizija_arhitekture",
        timestamp: now,
        metadata: { izvor: "hero", korak: 4, ishod: "prihvaćeno" },
      },
    ];

    requestId.current += 1;
    analyzeId.current += 1;
    questionIndex.current = HERO_CHAT.filter(
      (message) => message.sender === "ai",
    ).length;
    chatRef.current = HERO_CHAT;

    setActions(demoActions);
    setAxesOverride([...CAMPAIGN_AXES]);
    setRadar(HERO_RADAR);
    setSessionMessages(HERO_CHAT);
    setGeneratedCV(HERO_CV);
    setMindprint(HERO_SUMMARY);
    setAnomaly(false);
    setAnalyzingStats(false);
    upsertCandidate(
      HERO_CHAT,
      {
        scores: HERO_RADAR,
        summary: HERO_SUMMARY,
        anomaly: false,
        cv: HERO_CV,
        reviews: reviewsFor(
          HERO_CHAT,
          HERO_OPINIONS.map((opinion) => ({ opinion })),
        ),
      },
      [...CAMPAIGN_AXES],
      "demo-marko",
    );
  }, [upsertCandidate]);

  const value = useMemo<TelemetryContextValue>(
    () => ({
      status,
      actions,
      startTime,
      campaignAxes,
      radar,
      chatMessages,
      generatedCV,
      mindprint,
      anomaly,
      analyzingStats,
      campaign,
      candidates,
      activeCandidateId,
      trackAction,
      triggerIncident,
      resolveIncident,
      autoFillDemo,
      autoFillHeroDemo,
      sendMessage,
      startNewCandidate,
      applyForPosition,
      publishCampaign,
      setCandidateDecision,
      deleteCandidate,
    }),
    [
      status,
      actions,
      startTime,
      campaignAxes,
      radar,
      chatMessages,
      generatedCV,
      mindprint,
      anomaly,
      analyzingStats,
      campaign,
      candidates,
      activeCandidateId,
      trackAction,
      triggerIncident,
      resolveIncident,
      autoFillDemo,
      autoFillHeroDemo,
      sendMessage,
      startNewCandidate,
      applyForPosition,
      publishCampaign,
      setCandidateDecision,
      deleteCandidate,
    ],
  );

  return (
    <TelemetryContext.Provider value={value}>
      {children}
    </TelemetryContext.Provider>
  );
}

export function useTelemetry() {
  const context = useContext(TelemetryContext);
  if (!context) {
    throw new Error("useTelemetry must be used within TelemetryProvider");
  }
  return context;
}
