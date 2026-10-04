"use client";

import { useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { ArrowLeft, MapPin, Search, Send, Zap } from "lucide-react";
import { CandidateAuth, CandidateUpload } from "@/components/candidate-access";
import { Button } from "@/components/ui/button";
import {
  getSessionServerSnapshot,
  getSessionSnapshot,
  logoutAccount,
  subscribeAccounts,
} from "@/lib/candidate-account";
import { Progress } from "@/components/ui/progress";
import {
  interviewProgressDetail,
  interviewReadyToClose,
  type ProgressStep,
} from "@/lib/interview-progress";
import { interviewQuestions } from "@/lib/campaign";
import { CONDUCT_EXCLUSION } from "@/lib/conduct";
import { useTelemetry } from "@/lib/telemetry-context";
import { catalog, suggestRoles, type OpenRole, type SuggestedRole } from "@/lib/positions";
import { cn } from "@/lib/utils";

const QUICK_FILTERS = ["Backend", "React", "SQL", "Python", "Remote"] as const;

function stackChips(stack: string) {
  return stack
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 4);
}


function StepBadge({ step }: { step: ProgressStep }) {
  return (
    <span className="animate-in fade-in slide-in-from-top-1 text-[11px] text-emerald-300 tabular-nums duration-300">
      +{step.delta}% · {step.reason}
    </span>
  );
}

function RoleCard({
  role,
  featured,
  personalized,
  onOpen,
}: {
  role: SuggestedRole;
  featured?: boolean;
  personalized?: boolean;
  onOpen: () => void;
}) {
  const chips = stackChips(role.stack);

  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "w-full rounded-3xl border px-4 py-3.5 text-left transition",
        featured
          ? "border-primary/40 bg-card"
          : "border-white/[0.06] bg-card hover:border-primary/25",
      )}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="rounded-full bg-primary px-2.5 py-0.5 text-[11px] font-medium text-primary-foreground">
          {personalized ? `${role.match}% poklapanje` : role.why}
        </span>
        {featured ? (
          <span className="text-[11px] font-medium text-zinc-400">Najbolji predlog</span>
        ) : role.live ? (
          <span className="text-[11px] font-medium text-zinc-400">Novo</span>
        ) : (
          <span className="text-[11px] text-zinc-500">{role.type}</span>
        )}
      </span>
      <span className="font-display mt-2 block text-[15px] font-semibold tracking-tight text-zinc-50">
        {role.title}
      </span>
      <span className="mt-1 flex items-center gap-1.5 text-sm text-zinc-400">
        <MapPin className="size-3.5 shrink-0" />
        {role.team} · {role.location}
      </span>
      <span className="mt-2 block text-sm leading-relaxed text-zinc-300">{role.summary}</span>
      <span className="mt-3 flex flex-wrap gap-1.5">
        {chips.map((chip) => (
          <span
            key={chip}
            className="rounded-full bg-white/[0.06] px-2.5 py-0.5 text-[11px] text-zinc-300"
          >
            {chip}
          </span>
        ))}
      </span>
      <span className="mt-3 flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-zinc-100">{role.salary}</span>
        <span className="truncate text-xs text-zinc-500">
          {personalized ? role.why : "Pogledaj oglas"}
        </span>
      </span>
    </button>
  );
}

export function AiChatInterview() {
  const {
    chatMessages,
    sendMessage,
    autoFillHeroDemo,
    applyForPosition,
    startNewCandidate,
    campaign,
  } = useTelemetry();
  const [draft, setDraft] = useState("");
  const [awaitingReply, setAwaitingReply] = useState(false);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<OpenRole | null>(null);
  const [stage, setStage] = useState<"search" | "detail" | "chat" | "upload">("search");
  const [resumeChat, setResumeChat] = useState(false);
  const [finished, setFinished] = useState(false);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const pendingApply = useRef<OpenRole | null>(null);
  const account = useSyncExternalStore(
    subscribeAccounts,
    getSessionSnapshot,
    getSessionServerSnapshot,
  );

  const roles = useMemo(() => catalog(campaign), [campaign]);
  const suggestions = useMemo(
    () => suggestRoles(roles, query, account?.profile ?? null),
    [roles, query, account],
  );

  const excluded = chatMessages.some(
    (message) => message.kind === "conduct" && message.text === CONDUCT_EXCLUSION,
  );
  const warned =
    !excluded && chatMessages.some((message) => message.kind === "conduct");
  const shownStage =
    chatMessages.length > 0 && (resumeChat || stage === "chat") ? "chat" : stage;
  const showTyping =
    awaitingReply && chatMessages.at(-1)?.sender !== "ai";

  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    scroller.scrollTop = scroller.scrollHeight;
  }, [chatMessages]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || finished || excluded) return;
    sendMessage(text);
    setDraft("");
    setAwaitingReply(true);
  }

  function openRole(role: OpenRole) {
    setPicked(role);
    setStage("detail");
  }

  function apply(role: OpenRole) {
    if (!getSessionSnapshot()?.profile) {
      pendingApply.current = role;
      setPicked(role);
      setStage("upload");
      return;
    }
    pendingApply.current = null;
    if (chatMessages.length > 0) startNewCandidate();
    setFinished(false);
    setAwaitingReply(true);
    setResumeChat(false);
    setStage("chat");
    applyForPosition(role);
  }

  function leave() {
    startNewCandidate();
    setFinished(false);
    setResumeChat(false);
    setStage("search");
    setPicked(null);
    setQuery("");
    setDraft("");
    logoutAccount();
  }

  if (!account) return <CandidateAuth />;

  if (stage === "upload") {
    return (
      <CandidateUpload
        email={account.email}
        intentTitle={pendingApply.current?.title}
        onBack={() => setStage(picked ? "detail" : "search")}
        onSaved={() => {
          const role = pendingApply.current;
          pendingApply.current = null;
          if (role) apply(role);
          else setStage("search");
        }}
      />
    );
  }

  const profile = account.profile;
  const profileLine = profile?.fullName || account.email;
  const firstName = profile?.fullName.split(" ")[0];

  if (shownStage === "search") {
    const browsing = query.trim().length < 2;
    const featured =
      browsing && suggestions[0] && (profile || suggestions[0].live) ? suggestions[0] : null;
    const rest = featured ? suggestions.slice(1) : suggestions;

    return (
      <div className="flex h-full min-h-0 flex-col text-zinc-100">
        <header className="flex items-start gap-3 border-b border-white/10 px-5 py-4">
          <div className="min-w-0">
            <p className="mark text-xs text-zinc-400">Kandidat</p>
            <p className="font-display mt-1 text-lg leading-tight font-semibold tracking-tight text-zinc-50">
              {firstName ? `Zdravo, ${firstName}` : "Predlozi oglasa"}
            </p>
            <p className="mt-1 truncate text-xs text-zinc-400">
              {suggestions.length} otvorenih · {profileLine}
            </p>
          </div>
          <button
            type="button"
            onClick={leave}
            className="ml-auto shrink-0 rounded-lg px-2 py-1 text-xs text-zinc-400 hover:bg-white/5 hover:text-zinc-100"
          >
            Odjavi se
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <label className="relative block">
            <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-zinc-500" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Suži predloge: pozicija, grad, tehnologija"
              aria-label="Pretraga pozicija"
              className="h-12 w-full rounded-full border border-white/10 bg-card pr-4 pl-11 text-sm text-zinc-100 outline-none placeholder:text-zinc-500 focus-visible:border-primary/70 focus-visible:ring-2 focus-visible:ring-primary/30"
            />
          </label>

          <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1">
            {QUICK_FILTERS.map((filter) => {
              const active = query.trim().toLowerCase() === filter.toLowerCase();
              return (
                <button
                  key={filter}
                  type="button"
                  onClick={() => setQuery(active ? "" : filter)}
                  className={cn(
                    "shrink-0 rounded-full border px-3 py-1 text-xs",
                    active
                      ? "border-transparent bg-primary text-primary-foreground"
                      : "border-white/10 bg-card text-zinc-400 hover:text-zinc-100",
                  )}
                >
                  {filter}
                </button>
              );
            })}
          </div>

          {chatMessages.length > 0 ? (
            <button
              type="button"
              onClick={() => setResumeChat(true)}
              className="mt-3 text-sm text-primary hover:text-primary/80"
            >
              Nastavi otvoreni intervju
            </button>
          ) : null}

          {!profile ? (
            <button
              type="button"
              onClick={() => {
                pendingApply.current = null;
                setPicked(null);
                setStage("upload");
              }}
              className="mt-4 flex w-full flex-col gap-1 rounded-3xl border border-primary/30 bg-card px-4 py-3 text-left hover:border-primary/50"
            >
              <span className="text-sm font-medium text-zinc-100">Dodaj CV ili link</span>
              <span className="text-xs leading-relaxed text-zinc-400">
                Oglasi su već tu. Sa CV-jem ili LinkedIn linkom poklapanje ide po tvojim veštinama.
              </span>
            </button>
          ) : (profile.skills ?? []).length > 0 ? (
            <ul className="mt-4 flex flex-wrap gap-1.5">
              {profile.skills.slice(0, 5).map((skill) => (
                <li
                  key={skill}
                  className="rounded-full bg-white/[0.06] px-2.5 py-1 text-xs text-zinc-300"
                >
                  {skill}
                </li>
              ))}
            </ul>
          ) : null}

          {suggestions.length === 0 ? (
            <p className="mt-4 text-sm text-zinc-400">
              Nema oglasa za „{query.trim()}“.
            </p>
          ) : (
            <div className="mt-4 grid gap-3">
              <p className="text-xs text-zinc-500">
                {browsing ? "Predloženo za tebe" : "Rezultati"}
              </p>
              {featured ? (
                <RoleCard
                  role={featured}
                  featured
                  personalized={Boolean(profile)}
                  onOpen={() => openRole(featured)}
                />
              ) : null}
              {rest.map((role) => (
                <RoleCard
                  key={role.id}
                  role={role}
                  personalized={Boolean(profile)}
                  onOpen={() => openRole(role)}
                />
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-white/10 px-5 py-3">
          <button
            type="button"
            onClick={() => autoFillHeroDemo()}
            className="inline-flex items-center gap-1.5 rounded-md px-1 py-1 text-[11px] tracking-wide text-zinc-100/30 transition hover:text-zinc-100/75"
          >
            <Zap className="size-3" />
            Auto-Demo
          </button>
          <button
            type="button"
            onClick={() => {
              pendingApply.current = null;
              setPicked(null);
              setStage("upload");
            }}
            className="rounded-md px-1 py-1 text-[11px] text-zinc-500 hover:text-zinc-200"
          >
            {profile ? "Promeni profil" : "Dodaj CV ili link"}
          </button>
        </div>
      </div>
    );
  }

  if (shownStage === "detail" && picked) {
    const pickedView = suggestRoles([picked], "", profile).at(0) ?? {
      ...picked,
      match: picked.live ? 90 : 64,
      why: "Otvoren oglas",
    };
    const chips = stackChips(picked.stack);

    return (
      <div className="flex h-full min-h-0 flex-col text-zinc-100">
        <header className="border-b border-white/10 px-5 py-4">
          <button
            type="button"
            onClick={() => setStage("search")}
            className="mb-3 inline-flex items-center gap-1.5 text-[13px] text-zinc-400 hover:text-zinc-100"
          >
            <ArrowLeft className="size-3.5" />
            Nazad na oglase
          </button>
          <div className="flex items-center gap-2">
            <p className="mark text-xs text-zinc-400">{picked.team}</p>
            {picked.live ? (
              <span className="rounded-full bg-primary px-2.5 py-0.5 text-[11px] font-medium text-primary-foreground">
                Novo
              </span>
            ) : null}
          </div>
          <p className="font-display mt-1 text-lg leading-tight font-semibold tracking-tight text-zinc-50">
            {picked.title}
          </p>
          <p className="mt-1 truncate text-xs text-zinc-400">{profileLine}</p>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="flex items-center justify-between gap-3 rounded-3xl border border-white/[0.06] bg-card px-4 py-3">
            <div>
              <p className="text-xs text-zinc-400">{profile ? "Poklapanje" : "Status"}</p>
              <p className="text-3xl font-semibold tracking-tight text-primary">
                {profile ? `${pickedView.match}%` : "Otvoreno"}
              </p>
            </div>
            <p className="max-w-[14rem] text-right text-sm leading-snug text-zinc-300">
              {profile ? pickedView.why : "Prijava vodi u AI intervju"}
            </p>
          </div>

          <p className="mt-4 flex items-center gap-1.5 text-sm text-zinc-400">
            <MapPin className="size-3.5" />
            {picked.location}
            <span className="text-zinc-600">·</span>
            {picked.type}
          </p>
          <p className="mt-2 text-sm font-medium text-zinc-100">{picked.salary}</p>
          <p className="mt-4 text-[15px] leading-relaxed text-zinc-100">{picked.summary}</p>
          <ul className="mt-4 flex flex-wrap gap-1.5">
            {chips.map((chip) => (
              <li
                key={chip}
                className="rounded-full bg-white/[0.06] px-2.5 py-1 text-xs text-zinc-300"
              >
                {chip}
              </li>
            ))}
          </ul>
        </div>

        <div className="border-t border-white/10 px-5 py-4">
          <Button
            type="button"
            onClick={() => apply(picked)}
            className="h-11 w-full rounded-full bg-primary font-medium text-primary-foreground hover:bg-primary/90"
          >
            {profile ? "Apliciraj" : "Apliciraj uz profil"}
          </Button>
        </div>
      </div>
    );
  }

  const position = campaign?.positionTitle.trim();
  const plannedQuestions = interviewQuestions(campaign, profile).length;
  const { progress: interviewProgress, last: lastStep } =
    interviewProgressDetail(chatMessages, plannedQuestions);
  const readyToFinish =
    !finished &&
    !showTyping &&
    interviewReadyToClose(chatMessages, plannedQuestions);

  return (
    <div className="flex h-full min-h-0 flex-col text-zinc-100">
      <header className="flex items-center gap-3 border-b border-white/10 px-5 py-4">
        <div className="flex size-9 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
          AI
        </div>
        <div className="min-w-0">
          <p className="mark text-xs text-zinc-400">Kandidat</p>
          <p className="font-display truncate text-lg leading-tight font-semibold tracking-tight text-zinc-50">
            {position || "AI intervju"}
          </p>
          <p className="truncate text-xs text-zinc-400">{profileLine}</p>
        </div>
        <div className="ml-auto flex shrink-0 flex-col items-end gap-1.5">
          <button
            type="button"
            onClick={leave}
            className="rounded-lg px-2 py-1 text-xs text-zinc-400 hover:bg-white/5 hover:text-zinc-100"
          >
            Odjavi se
          </button>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              Napredak: {Math.round(interviewProgress)}%
            </span>
            <Progress className="h-1.5 w-32" value={interviewProgress} />
          </div>
          {lastStep ? (
            <StepBadge key={chatMessages.length} step={lastStep} />
          ) : null}
        </div>
      </header>

      <div
        ref={scrollerRef}
        className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4"
      >
        {chatMessages.length === 0 ? (
          <p className="max-w-sm text-sm leading-relaxed text-zinc-400">
            Prijava je ušla u chat. AI postavlja prvo pitanje.
          </p>
        ) : (
          chatMessages.map((message, index) => {
            const fromCandidate = message.sender === "candidate";
            const conduct = message.kind === "conduct";
            return (
              <div
                key={`${message.sender}-${index}`}
                className={cn(
                  "flex",
                  fromCandidate ? "justify-end" : "justify-start",
                )}
              >
                <p
                  className={cn(
                    "max-w-[82%] rounded-3xl px-3.5 py-2.5 text-sm leading-relaxed",
                    fromCandidate
                      ? "rounded-br-md bg-primary text-primary-foreground"
                      : conduct
                        ? "rounded-bl-md border border-rose-400/40 bg-rose-500/15 text-rose-50"
                        : "rounded-bl-md bg-card text-zinc-100",
                  )}
                >
                  {conduct ? (
                    <span className="mb-1 block text-[11px] font-medium tracking-wide text-rose-200/80">
                      {message.text === CONDUCT_EXCLUSION ? "Isključenje" : "Upozorenje"}
                    </span>
                  ) : null}
                  {message.text}
                </p>
              </div>
            );
          })
        )}

        {showTyping ? (
          <div className="flex justify-start">
            <p className="rounded-3xl rounded-bl-md bg-card px-3.5 py-2.5 text-sm text-primary">
              AI kuca…
            </p>
          </div>
        ) : null}
      </div>

      {excluded ? (
        <div className="border-t border-rose-400/30 bg-rose-500/10 px-5 py-4">
          <p className="text-sm leading-relaxed text-rose-50">
            Intervju je prekinut. Zbog ponovljenog uvredljivog jezika više ne možeš da šalješ poruke.
          </p>
          <Button
            type="button"
            onClick={() => {
              setResumeChat(false);
              setStage("search");
            }}
            className="mt-3 h-11 w-full rounded-full bg-primary font-medium text-primary-foreground hover:bg-primary/90"
          >
            Nazad na pozicije
          </Button>
        </div>
      ) : finished ? (
        <div className="border-t border-white/10 px-5 py-4">
          <p className="text-sm leading-relaxed text-zinc-300">
            Intervju je završen. Prijava je poslata.
          </p>
          <Button
            type="button"
            onClick={() => {
              setResumeChat(false);
              setStage("search");
            }}
            className="mt-3 h-11 w-full rounded-full bg-primary font-medium text-primary-foreground hover:bg-primary/90"
          >
            Nazad na pozicije
          </Button>
        </div>
      ) : readyToFinish ? (
        <div className="border-t border-white/10 px-5 py-4">
          <p className="text-sm leading-relaxed text-zinc-400">
            Sva pitanja su gotova. Završi intervju da pošalješ prijavu.
          </p>
          <Button
            type="button"
            onClick={() => setFinished(true)}
            className="mt-3 h-11 w-full rounded-full bg-primary font-medium text-primary-foreground hover:bg-primary/90"
          >
            Završi intervju
          </Button>
        </div>
      ) : (
        <form
          onSubmit={handleSubmit}
          className="border-t border-white/10 px-5 pt-4 pb-3"
        >
          {warned ? (
            <p className="mb-3 rounded-2xl border border-rose-400/30 bg-rose-500/10 px-3.5 py-2.5 text-sm leading-relaxed text-rose-50">
              Ovo je upozorenje. Sledeći uvredljiv jezik isključuje te iz intervjua.
            </p>
          ) : null}
          <div className="flex items-center gap-2">
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Napiši odgovor…"
              aria-label="Odgovor kandidata"
              className="h-11 min-w-0 flex-1 rounded-full border border-white/10 bg-card px-4 text-sm text-zinc-100 outline-none placeholder:text-zinc-500 focus-visible:border-primary/70 focus-visible:ring-2 focus-visible:ring-primary/30"
            />
            <Button
              type="submit"
              disabled={!draft.trim()}
              className="h-11 rounded-full bg-primary px-4 font-medium text-primary-foreground hover:bg-primary/90"
            >
              <Send />
              Pošalji
            </Button>
          </div>

          <button
            type="button"
            onClick={() => autoFillHeroDemo()}
            className="mt-2 inline-flex items-center gap-1.5 rounded-md px-1 py-1 text-[11px] tracking-wide text-zinc-100/30 transition hover:text-zinc-100/75"
          >
            <Zap className="size-3" />
            Auto-Demo
          </button>
        </form>
      )}
    </div>
  );
}
