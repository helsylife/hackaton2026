"use client";

import { useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { Check, Gem, Loader2, Plus, Sparkles, Trash2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  DEMO_INSTRUCTIONS,
  DEMO_QUESTIONS,
  EMPTY_TARGETS,
  TARGETS,
  draftQuestions,
  getCampaignServerSnapshot,
  getCampaignSnapshot,
  subscribeCampaign,
  type InterviewQuestion,
  type TargetFlags,
} from "@/lib/campaign";
import type { CandidateDecision } from "@/lib/candidates";
import { useTelemetry } from "@/lib/telemetry-context";
import { cn } from "@/lib/utils";

type View = "kampanja" | "statistika";

function newQuestion(): InterviewQuestion {
  return { id: `q-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, question: "", expected: "" };
}

function ScoreRow({ label, value }: { label: string; value: number }) {
  const tone = value === 0 ? "bg-white/10" : "bg-primary";

  return (
    <div className="grid gap-1.5">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="text-zinc-100">{label}</span>
        <span className="font-mono text-[13px] tabular-nums text-primary">{value}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-zinc-800">
        <div
          className={cn("h-full rounded-full transition-[width] duration-500", tone)}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

function isInterviewAnswer(answer: string) {
  return !/^prijavljujem se za poziciju\b/i.test(answer);
}

function opinionIsCautious(opinion: string) {
  return /sumnj|prepis|generis|udžben|udzben|raskorak|transakcion|nestrplj/i.test(
    opinion,
  );
}

function decisionLabel(decision: CandidateDecision) {
  if (decision === "accepted") return "Prihvaćen";
  if (decision === "rejected") return "Odbijen";
  return "U razmatranju";
}

function LiveStats({
  onEdit,
}: {
  onEdit: () => void;
}) {
  const {
    radar,
    campaignAxes,
    mindprint,
    anomaly,
    generatedCV,
    analyzingStats,
    campaign,
    candidates,
    activeCandidateId,
    setCandidateDecision,
    deleteCandidate,
  } = useTelemetry();
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const selected =
    candidates.find((item) => item.id === pinnedId) ??
    candidates.find((item) => item.id === activeCandidateId) ??
    candidates[0] ??
    null;
  const axes = selected?.axes.length ? selected.axes : campaignAxes;
  const bars = selected?.scores ?? radar;
  const summary = (selected?.summary ?? mindprint).trim();
  const flagged = selected ? selected.anomaly : anomaly;
  const cvItems = selected?.cv ?? generatedCV;
  const reviews = (selected?.reviews ?? []).filter((review) =>
    isInterviewAnswer(review.answer),
  );
  const liveHere = Boolean(
    selected && selected.id === activeCandidateId && analyzingStats,
  );

  return (
    <div className="flex flex-col gap-4 p-4">
      <section className="rounded-3xl border border-white/[0.06] bg-card p-4">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold tracking-tight text-zinc-50">Kandidati</h2>
            <p className="mt-1 text-xs leading-relaxed text-zinc-400">
              Svaki chat sklapa poseban CV. Uz odgovor stoji AI mišljenje.
            </p>
          </div>
          {liveHere ? (
            <span className="inline-flex items-center gap-1.5 text-xs text-zinc-400">
              <Loader2 className="size-3 animate-spin" />
              AI piše
            </span>
          ) : null}
        </div>
        {candidates.length === 0 ? (
          <p className="text-sm leading-relaxed text-zinc-400">
            Još nema dosijea. Kad kandidat odgovori, ovde se otvara njegov CV.
          </p>
        ) : (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {candidates.map((candidate) => {
              const open = selected?.id === candidate.id;
              return (
                <button
                  key={candidate.id}
                  type="button"
                  onClick={() => {
                    setPinnedId(candidate.id);
                    setConfirmDeleteId(null);
                  }}
                  className={cn(
                    "shrink-0 rounded-xl border px-3 py-2 text-left",
                    open
                      ? "border-primary/50 bg-primary/10"
                      : candidate.decision === "accepted"
                        ? "border-emerald-400/35 bg-emerald-500/10 hover:border-emerald-300/50"
                        : candidate.decision === "rejected"
                          ? "border-rose-400/30 bg-rose-500/10 hover:border-rose-300/45"
                          : "border-white/10 bg-zinc-950 hover:border-white/20",
                  )}
                >
                  <span className="block text-sm font-semibold text-zinc-50">
                    {candidate.name}
                  </span>
                  <span className="mt-0.5 block max-w-40 truncate text-[11px] text-zinc-400">
                    {candidate.position}
                    {candidate.id === activeCandidateId ? " · uživo" : ""}
                  </span>
                  <span
                    className={cn(
                      "mt-1 block text-[11px] font-medium",
                      candidate.decision === "accepted"
                        ? "text-emerald-200"
                        : candidate.decision === "rejected"
                          ? "text-rose-200"
                          : "text-zinc-500",
                    )}
                  >
                    {decisionLabel(candidate.decision)}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {selected ? (
        <section className="rounded-3xl border border-white/[0.06] bg-card p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold tracking-tight text-zinc-50">CV</h2>
              <p className="mt-1 text-xs text-zinc-400">Sastavljen iz odgovora u chatu.</p>
            </div>
            <span
              className={cn(
                "rounded-full border px-2.5 py-1 text-[11px] font-medium",
                selected.decision === "accepted"
                  ? "border-emerald-400/50 bg-emerald-500/15 text-emerald-100"
                  : selected.decision === "rejected"
                    ? "border-rose-400/45 bg-rose-500/15 text-rose-100"
                    : "border-white/15 bg-zinc-950 text-zinc-300",
              )}
            >
              {decisionLabel(selected.decision)}
            </span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setCandidateDecision(selected.id, "accepted")}
              className={cn(
                "border-emerald-400/40 bg-emerald-500/10 text-emerald-50 hover:bg-emerald-500/20 hover:text-emerald-50",
                selected.decision === "accepted" && "bg-emerald-500/25",
              )}
            >
              <Check />
              Prihvati
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setCandidateDecision(selected.id, "rejected")}
              className={cn(
                "border-rose-400/40 bg-rose-500/10 text-rose-50 hover:bg-rose-500/20 hover:text-rose-50",
                selected.decision === "rejected" && "bg-rose-500/25",
              )}
            >
              <X />
              Odbij
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                if (confirmDeleteId === selected.id) {
                  deleteCandidate(selected.id);
                  if (pinnedId === selected.id) setPinnedId(null);
                  setConfirmDeleteId(null);
                  return;
                }
                setConfirmDeleteId(selected.id);
              }}
              className="border-white/15 bg-zinc-950 text-zinc-100 hover:bg-rose-500/15 hover:text-rose-50"
            >
              <Trash2 />
              {confirmDeleteId === selected.id ? "Potvrdi brisanje" : "Obriši"}
            </Button>
          </div>
          <div className="mt-3 rounded-xl border border-white/10 bg-zinc-950 p-3">
            <p className="font-display text-base font-semibold tracking-tight text-zinc-50">
              {selected.name}
            </p>
            <p className="mt-0.5 text-sm text-zinc-400">{selected.position}</p>
            {cvItems.length === 0 ? (
              <p className="mt-3 text-sm text-zinc-400">
                Stavke stižu čim u odgovorima ima konkretnog iskustva.
              </p>
            ) : (
              <ul className="mt-3 flex flex-col gap-1.5">
                {cvItems.map((item) => {
                  const suspicious = /sumnjiv/i.test(item);
                  return (
                    <li key={item} className="text-sm text-zinc-100">
                      <Badge
                        variant="outline"
                        className={cn(
                          "h-auto max-w-full px-2.5 py-1 text-left whitespace-normal",
                          suspicious
                            ? "border-amber-400/60 bg-amber-500/15 text-amber-100"
                            : "border-white/10 bg-zinc-800 text-zinc-200",
                        )}
                      >
                        {item}
                      </Badge>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>
      ) : null}

      <section className="rounded-3xl border border-white/[0.06] bg-card p-4">
        <h2 className="text-sm font-semibold tracking-tight text-zinc-50">
          Odgovori i AI mišljenje
        </h2>
        {!selected || reviews.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-400">Još nema odgovora.</p>
        ) : (
          <ol className="mt-3 flex flex-col gap-3">
            {reviews.map((review, index) => {
              const cautious = opinionIsCautious(review.opinion);
              return (
                <li
                  key={`${index}-${review.answer.slice(0, 16)}`}
                  className="rounded-xl border border-white/10 bg-zinc-950 p-3"
                >
                  <p className="text-xs text-zinc-500">
                    Pitanje {index + 1}
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-zinc-300">
                    {review.question}
                  </p>
                  <p className="mt-3 text-xs text-zinc-500">
                    Odgovor
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-zinc-50">{review.answer}</p>
                  <p
                    className={cn(
                      "mt-3 rounded-lg border px-2.5 py-2 text-xs leading-relaxed",
                      cautious
                        ? "border-amber-400/40 bg-amber-500/10 text-amber-50"
                        : "border-white/10 bg-zinc-800 text-zinc-200",
                    )}
                  >
                    <span className="font-semibold">AI mišljenje. </span>
                    {review.opinion}
                  </p>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <section className="rounded-3xl border border-white/[0.06] bg-card p-4">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold tracking-tight text-zinc-50">Ocene</h2>
            <p className="mt-1 text-xs leading-relaxed text-zinc-400">
              {selected
                ? `${selected.name}: ${reviews.length} ${reviews.length === 1 ? "odgovor" : "odgovora"} u odnosu na rubriku.`
                : "Čeka se prvi odgovor kandidata. Ose su spremne."}
            </p>
          </div>
          {liveHere ? (
            <span className="inline-flex items-center gap-1.5 text-xs text-zinc-400">
              <Loader2 className="size-3 animate-spin" />
              AI dopunjava
            </span>
          ) : null}
        </div>
        <div className="grid gap-3">
          {axes.map((axis) => (
            <ScoreRow key={axis} label={axis} value={bars[axis] ?? 0} />
          ))}
        </div>
      </section>

      <section className="rounded-3xl border border-white/[0.06] bg-card p-4">
        <h2 className="text-sm font-semibold tracking-tight text-zinc-50">
          Pre-Interview Context
        </h2>
        <p className="mt-1 text-xs leading-relaxed text-zinc-400">
          Šta je AI izvukao iz dokumenta pre chata.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Badge
            variant="outline"
            className="h-auto border-white/15 bg-zinc-950 px-2.5 py-1 text-zinc-100 whitespace-normal"
          >
            Source: Uploaded PDF
          </Badge>
          <Badge
            variant="outline"
            className="h-auto border-amber-400/45 bg-amber-500/10 px-2.5 py-1 text-amber-50 whitespace-normal"
          >
            Status: Self-Taught
          </Badge>
          <Badge
            variant="outline"
            className="h-auto border-white/10 bg-zinc-800 px-2.5 py-1 text-zinc-200 whitespace-normal"
          >
            Claimed Skills: Node.js, SQL
          </Badge>
        </div>
        {summary ? (
          <div
            role="status"
            className="mt-3 rounded-xl border border-emerald-400/45 bg-emerald-500/10 px-3 py-2.5"
          >
            <div className="flex flex-wrap items-center gap-2">
              <Gem className="size-3.5 text-emerald-200" aria-hidden />
              <p className="text-sm font-semibold text-emerald-50">Hidden Gem</p>
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-emerald-50">
              Chat je potvrdio tvrdnje iz dokumenta. Kandidat nije ostao na Node.js i
              SQL sa papira: sam je predložio EXPLAIN ANALYZE i kompozitni indeks na
              user_id i created_at, umesto da nagađa.
            </p>
          </div>
        ) : null}
      </section>

      <section
        className={cn(
          "rounded-lg border p-4",
          flagged
            ? "border-orange-400/50 bg-[#1a0d08]"
            : "border-white/[0.06] bg-card",
        )}
      >
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold tracking-tight text-zinc-50">
            AI MindPrint Summary
          </h2>
          {flagged && summary ? (
            <Badge
              variant="outline"
              className="border-orange-400/60 bg-orange-500/15 text-orange-100"
            >
              Anomalija
            </Badge>
          ) : null}
        </div>
        <p className="text-sm leading-relaxed text-zinc-300">
          {summary ||
            "Zaključak se piše čim kandidat odgovori. Dok nema teksta, ocene ostaju na nuli."}
        </p>
      </section>

      <section className="rounded-3xl border border-white/[0.06] bg-card p-4">
        <h2 className="text-sm font-semibold tracking-tight text-zinc-50">Rubrika</h2>
        <p className="mt-1 text-xs text-zinc-400">
          Očekivanja vidi samo administrator.
        </p>
        {(campaign?.questions ?? []).filter((item) => item.question.trim()).length ===
        0 ? (
          <button
            type="button"
            onClick={onEdit}
            className="mt-3 text-sm text-primary underline-offset-2 hover:underline"
          >
            Dodaj pitanja i očekivane odgovore
          </button>
        ) : (
          <ol className="mt-3 flex flex-col gap-3">
            {campaign?.questions
              .filter((item) => item.question.trim())
              .map((item, index) => (
                <li
                  key={item.id}
                  className="rounded-xl border border-white/10 bg-zinc-950 p-3"
                >
                  <p className="text-xs text-zinc-500">
                    Pitanje {index + 1}
                  </p>
                  <p className="mt-1 text-sm text-zinc-100">{item.question}</p>
                  {item.expected.trim() ? (
                    <p className="mt-2 text-xs leading-relaxed text-zinc-400">
                      Očekivano: {item.expected}
                    </p>
                  ) : null}
                </li>
              ))}
          </ol>
        )}
      </section>
    </div>
  );
}

export function AdminWorkspace({ layout }: { layout: "dock" | "page" }) {
  const router = useRouter();
  const { publishCampaign, chatMessages, candidates } = useTelemetry();
  const storedCampaign = useSyncExternalStore(
    subscribeCampaign,
    getCampaignSnapshot,
    getCampaignServerSnapshot,
  );
  const [chosenView, setChosenView] = useState<View | null>(null);
  const [positionDraft, setPositionDraft] = useState<string | null>(null);
  const [techDraft, setTechDraft] = useState<string | null>(null);
  const [instructionDraft, setInstructionDraft] = useState<string | null>(null);
  const [targetDraft, setTargetDraft] = useState<TargetFlags | null>(null);
  const [questionDraft, setQuestionDraft] = useState<InterviewQuestion[] | null>(
    null,
  );
  const [generating, setGenerating] = useState(false);
  const [notice, setNotice] = useState("");
  const positionTitle = positionDraft ?? storedCampaign?.positionTitle ?? "";
  const techStack = techDraft ?? storedCampaign?.techStack ?? "";
  const instructions = instructionDraft ?? storedCampaign?.instructions ?? "";
  const targets = targetDraft ?? storedCampaign?.targets ?? EMPTY_TARGETS;
  const questions = questionDraft ?? storedCampaign?.questions ?? [];
  const hasCandidateSignal =
    candidates.length > 0 ||
    chatMessages.some((message) => message.sender === "candidate");
  const view =
    chosenView ??
    (layout === "dock" && hasCandidateSignal ? "statistika" : "kampanja");

  function selectView(next: View) {
    setChosenView(next);
  }

  function editTargets(update: (current: TargetFlags) => TargetFlags) {
    setTargetDraft((current) =>
      update(current ?? storedCampaign?.targets ?? EMPTY_TARGETS),
    );
  }

  function editQuestions(
    update: (current: InterviewQuestion[]) => InterviewQuestion[],
  ) {
    setQuestionDraft((current) =>
      update(current ?? storedCampaign?.questions ?? []),
    );
  }

  function fillExample() {
    setPositionDraft("Database Administrator");
    setTechDraft("MySQL, SQLAlchemy, Python");
    setInstructionDraft(DEMO_INSTRUCTIONS);
    editTargets((current) => ({ ...current, honesty: true, abstraction: true }));
    setQuestionDraft(DEMO_QUESTIONS.map((item) => ({ ...item })));
    setNotice("Primer je unet. Pokreni intervju kad rubrika izgleda kako treba.");
  }

  async function handleGenerate() {
    if (!positionTitle.trim()) {
      setNotice("Upiši naziv pozicije, pa tek onda traži predlog.");
      return;
    }

    setGenerating(true);
    setNotice("");
    try {
      const response = await fetch("/api/brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          positionTitle,
          techStack,
          instructions,
          targets,
        }),
      });
      if (!response.ok) throw new Error("brief failed");

      const data = (await response.json()) as {
        questions?: { question: string; expected: string }[];
      };
      const next = (data.questions ?? [])
        .filter((item) => item.question?.trim() && item.expected?.trim())
        .map((item, index) => ({
          id: `ai-${Date.now()}-${index}`,
          question: item.question.trim(),
          expected: item.expected.trim(),
        }));
      if (next.length === 0) throw new Error("empty");

      setQuestionDraft(next);
      setNotice("AI je predložio pitanja i očekivane odgovore. Izmeni ih pre pokretanja.");
    } catch {
      setQuestionDraft(draftQuestions(positionTitle, techStack));
      setNotice(
        "AI predlog nije stigao, pa je rubrika sastavljena iz pozicije i tehnologija. Možeš je menjati.",
      );
    } finally {
      setGenerating(false);
    }
  }

  function handleDeploy() {
    const brief = questions.filter((item) => item.question.trim());
    if (!positionTitle.trim()) {
      setNotice("Upiši naziv pozicije.");
      return;
    }
    if (brief.length === 0) {
      setNotice("Dodaj bar jedno pitanje, ili klikni Predloži pitanja.");
      return;
    }

    const result = publishCampaign({
      positionTitle: positionTitle.trim(),
      techStack: techStack.trim(),
      instructions: instructions.trim(),
      targets,
      questions: brief,
    });

    if (layout === "page") {
      router.push("/");
      return;
    }

    setChosenView("statistika");
    setNotice(
      result === "started"
        ? "Pozicija je objavljena. Kandidat je traži, aplicira, i tek tada ulazi u chat."
        : "Rubrika je sačuvana. Sledeća pitanja i ocene koriste ove izmene.",
    );
  }

  const answerCount = chatMessages.filter(
    (message) => message.sender === "candidate",
  ).length;

  return (
    <div
      className={cn(
        "flex min-h-0 flex-col text-zinc-100",
        layout === "dock" ? "h-full" : "min-h-screen",
      )}
    >
      <header className="shrink-0 border-b border-white/10 px-5 py-4">
        {layout === "page" ? (
          <button
            type="button"
            onClick={() => router.push("/")}
            className="mb-3 text-xs text-zinc-400 hover:text-zinc-100"
          >
            Nazad na intervju
          </button>
        ) : null}
        <p className="mark text-xs text-zinc-400">Administrator</p>
        <h1 className="font-display mt-1 text-lg leading-tight font-semibold tracking-tight text-zinc-50">
          {positionTitle.trim() || "Nova kampanja"}
        </h1>
        {layout === "page" ? (
          <p className="mt-2 max-w-xl text-xs leading-relaxed text-zinc-400">
            Pitanja i očekivanja ostaju skrivena. Kandidat prvo traži poziciju,
            aplicira, i tek tada ulazi u chat.
          </p>
        ) : null}
        {layout === "dock" ? (
        <div className="mt-3 grid grid-cols-2 gap-1 rounded-full bg-black/30 p-1">
          <button
            type="button"
            onClick={() => selectView("kampanja")}
            className={cn(
              "rounded-full px-3 py-1.5 text-sm",
              view === "kampanja"
                ? "bg-primary font-medium text-primary-foreground"
                : "text-zinc-400 hover:text-zinc-100",
            )}
          >
            Kampanja
          </button>
          <button
            type="button"
            onClick={() => selectView("statistika")}
            className={cn(
              "rounded-full px-3 py-1.5 text-sm",
              view === "statistika"
                ? "bg-primary font-medium text-primary-foreground"
                : "text-zinc-400 hover:text-zinc-100",
            )}
          >
            Kandidati
            {candidates.length > 0 ? (
              <span
                className={cn(
                  "ml-1.5 font-mono text-xs tabular-nums",
                  view === "statistika" ? "text-primary-foreground/70" : "text-primary",
                )}
              >
                {candidates.length}
              </span>
            ) : null}
          </button>
        </div>
        ) : null}
      </header>

      {view === "statistika" ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          {notice ? (
            <p className="px-4 pt-4 text-xs leading-relaxed text-zinc-400" role="status">
              {notice}
            </p>
          ) : null}
          <LiveStats onEdit={() => selectView("kampanja")} />
        </div>
      ) : (
        <>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="flex flex-col gap-4 p-4">
              <section className="grid gap-3 rounded-3xl border border-white/[0.06] bg-card p-4">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-sm font-semibold tracking-tight">Uloga</h2>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={fillExample}
                    className="text-zinc-300 hover:bg-white/10 hover:text-zinc-50"
                  >
                    Primer
                  </Button>
                </div>
                <label className="grid gap-1.5 text-sm">
                  <span className="text-zinc-300">Pozicija</span>
                  <Input
                    value={positionTitle}
                    onChange={(event) => setPositionDraft(event.target.value)}
                    placeholder="Junior Backend Engineer"
                    className="h-11 rounded-2xl border-white/10 bg-black/25"
                  />
                </label>
                <label className="grid gap-1.5 text-sm">
                  <span className="text-zinc-300">Tehnologije</span>
                  <Input
                    value={techStack}
                    onChange={(event) => setTechDraft(event.target.value)}
                    placeholder="Node.js, PostgreSQL"
                    className="h-11 rounded-2xl border-white/10 bg-black/25"
                  />
                </label>
              </section>

              <section className="rounded-3xl border border-white/[0.06] bg-card p-4">
                <h2 className="text-sm font-semibold tracking-tight">Šta se meri</h2>
                <p className="mt-1 text-xs text-zinc-400">
                  Uključene stavke postaju ose na statistici.
                </p>
                <div className="mt-3 grid gap-2">
                  {TARGETS.map((target) => (
                    <div
                      key={target.id}
                      className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-zinc-950 px-3 py-2.5"
                    >
                      <label htmlFor={`target-${target.id}`} className="text-sm text-zinc-100">
                        {target.label}
                      </label>
                      <Switch
                        id={`target-${target.id}`}
                        checked={targets[target.id]}
                        onCheckedChange={(checked) =>
                          editTargets((current) => ({
                            ...current,
                            [target.id]: checked,
                          }))
                        }
                      />
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-3xl border border-white/[0.06] bg-card p-4">
                <div className="mb-2 flex items-center gap-2">
                  <h2 className="text-sm font-semibold tracking-tight">Skrivene instrukcije</h2>
                  <Badge
                    variant="outline"
                    className="border-orange-400/50 bg-orange-500/10 text-orange-100"
                  >
                    Kandidat ne vidi
                  </Badge>
                </div>
                <Textarea
                  value={instructions}
                  onChange={(event) => setInstructionDraft(event.target.value)}
                  placeholder="Npr. Ako zvuči previše knjiški, postavi trik pitanje da proveriš autentičnost."
                  className="min-h-28 rounded-2xl border-white/10 bg-black/25"
                />
              </section>

              <section className="rounded-3xl border border-white/[0.06] bg-card p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold tracking-tight">Pitanja i očekivanja</h2>
                    <p className="mt-1 text-xs text-zinc-400">
                      AI predlaže pitanje i šta dobar odgovor treba da sadrži.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void handleGenerate()}
                    disabled={generating}
                    className="rounded-full border-white/10 bg-card text-zinc-100 hover:bg-white/5"
                  >
                    {generating ? (
                      <Loader2 className="animate-spin" data-icon="inline-start" />
                    ) : (
                      <Sparkles data-icon="inline-start" />
                    )}
                    Predloži pitanja
                  </Button>
                </div>

                <div className="mt-4 grid gap-3">
                  {questions.length === 0 ? (
                    <p className="text-sm text-zinc-400">
                      Nema pitanja. Predloži ih ili dodaj ručno.
                    </p>
                  ) : (
                    questions.map((item, index) => (
                      <div
                        key={item.id}
                        className="grid gap-2 rounded-xl border border-white/10 bg-zinc-950 p-3"
                      >
                        <div className="flex items-center justify-between">
                          <p className="text-xs text-zinc-500">
                            Pitanje {index + 1}
                          </p>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Ukloni pitanje ${index + 1}`}
                            onClick={() =>
                            editQuestions((current) =>
                              current.filter((entry) => entry.id !== item.id),
                            )
                            }
                            className="text-zinc-400 hover:bg-white/10 hover:text-zinc-100"
                          >
                            <Trash2 />
                          </Button>
                        </div>
                        <Textarea
                          value={item.question}
                          onChange={(event) =>
                            editQuestions((current) =>
                              current.map((entry) =>
                                entry.id === item.id
                                  ? { ...entry, question: event.target.value }
                                  : entry,
                              ),
                            )
                          }
                          placeholder="Pitanje koje kandidat čuje"
                          className="min-h-16 rounded-2xl border-white/10 bg-black/25"
                        />
                        <label className="grid gap-1.5 text-xs text-zinc-400">
                          Očekivani odgovor
                          <Textarea
                            value={item.expected}
                            onChange={(event) =>
                              editQuestions((current) =>
                                current.map((entry) =>
                                  entry.id === item.id
                                    ? { ...entry, expected: event.target.value }
                                    : entry,
                                ),
                              )
                            }
                            placeholder="Šta dobar odgovor sadrži, a šta je slab signal"
                            className="min-h-16 rounded-2xl border-white/10 bg-black/25 text-sm"
                          />
                        </label>
                      </div>
                    ))
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      editQuestions((current) => [...current, newQuestion()])
                    }
                    className="rounded-xl border-white/10 bg-transparent text-zinc-200 hover:bg-white/5"
                  >
                    <Plus data-icon="inline-start" />
                    Dodaj pitanje
                  </Button>
                </div>
              </section>
            </div>
          </div>
          <div className="shrink-0 border-t border-white/10 px-4 py-3">
            {notice ? (
              <p className="mb-2 text-xs leading-relaxed text-zinc-400" role="status">
                {notice}
              </p>
            ) : null}
            <Button
              type="button"
              onClick={handleDeploy}
              className="h-11 w-full rounded-full bg-primary font-medium text-primary-foreground hover:bg-primary/90"
            >
              {answerCount > 0 ? "Sačuvaj izmene" : "Objavi poziciju"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
