"use client";

import { useState, type FormEvent } from "react";
import { FileUp, Link2, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  loginAccount,
  logoutAccount,
  registerAccount,
  saveAccountProfile,
} from "@/lib/candidate-account";
import {
  isCandidateProfile,
  type CandidateProfile,
  type DocumentKind,
} from "@/lib/candidate-profile";

const fieldClass =
  "h-12 w-full rounded-full border border-white/10 bg-card px-4 text-sm text-zinc-100 outline-none placeholder:text-zinc-500 focus-visible:border-primary/70 focus-visible:ring-2 focus-visible:ring-primary/30";

function errorText(code: string) {
  if (code === "missing_key") return "Nema OpenAI ključa u .env.local.";
  if (code === "unsupported") return "Pošalji PDF ili TXT fajl.";
  if (code === "too_large") return "Fajl ili stranica su preveliki.";
  if (code === "invalid_url") return "Nalepi punu https adresu, npr. https://github.com/ime.";
  if (code === "linkedin") {
    return "LinkedIn ne daje profil bez prijave. Sačuvaj ga kao PDF (More → Save to PDF) i ubaci kao CV.";
  }
  if (code === "link_private") {
    return "Link je privatan. Na Drive-u ili Dropbox-u uključi „Anyone with the link“.";
  }
  if (code === "link_fetch") return "Ne mogu da otvorim taj link. Proveri adresu ili pošalji PDF.";
  if (code === "unreadable") {
    return "Ne mogu da pročitam dovoljno teksta. Probaj drugi link, PDF ili .txt.";
  }
  if (code === "empty") return "U dokumentu nema dovoljno ličnih podataka.";
  return "AI trenutno ne odgovara. Pokušaj ponovo.";
}

export function CandidateAuth() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const result =
      mode === "login"
        ? await loginAccount(email, password)
        : await registerAccount(email, password);
    setPending(false);
    if (!result.ok) setError(result.error);
  }

  const register = mode === "register";

  return (
    <div className="flex h-full min-h-0 flex-col text-zinc-100">
      <header className="border-b border-white/10 px-5 py-4">
        <p className="mark text-xs text-zinc-400">Kandidat</p>
        <p className="font-display mt-1 text-lg leading-tight font-semibold tracking-tight text-zinc-50">
          {register ? "Napravi nalog" : "Uloguj se"}
        </p>
      </header>

      <form
        onSubmit={onSubmit}
        className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-5"
      >
        <p className="max-w-sm text-sm leading-relaxed text-zinc-400">
          Mejl i lozinka su dovoljni. Ime, iskustvo i veštine ne kucaš — dolaze
          iz CV-ja, pisma ili linka profila.
        </p>

        <label className="grid gap-1.5 text-sm">
          Mejl
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="ana@primer.rs"
            className={fieldClass}
          />
        </label>

        <label className="grid gap-1.5 text-sm">
          Lozinka
          <input
            type="password"
            autoComplete={register ? "new-password" : "current-password"}
            required
            minLength={register ? 6 : undefined}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder={register ? "Najmanje 6 karaktera" : "Lozinka"}
            className={fieldClass}
          />
        </label>

        {error ? (
          <p className="text-sm text-rose-300" role="alert">
            {error}
          </p>
        ) : null}

        <Button
          type="submit"
          disabled={pending}
          className="h-11 rounded-full bg-primary font-medium text-primary-foreground hover:bg-primary/90"
        >
          {pending ? "Sačekaj…" : register ? "Registruj se" : "Uloguj se"}
        </Button>

        <button
          type="button"
          onClick={() => {
            setMode(register ? "login" : "register");
            setError("");
          }}
          className="self-start text-sm text-primary hover:text-primary/80"
        >
          {register ? "Već imaš nalog? Uloguj se" : "Nemaš nalog? Registruj se"}
        </button>
      </form>
    </div>
  );
}

export function CandidateUpload({
  email,
  intentTitle,
  onSaved,
  onBack,
}: {
  email: string;
  intentTitle?: string;
  onSaved?: () => void;
  onBack?: () => void;
}) {
  const [kind, setKind] = useState<DocumentKind>("cv");
  const [file, setFile] = useState<File | null>(null);
  const [link, setLink] = useState("");
  const [dragging, setDragging] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<CandidateProfile | null>(null);

  function takeFile(next: File | undefined) {
    if (!next) return;
    setFile(next);
    setDraft(null);
    setError("");
  }

  async function extract() {
    const url = link.trim();
    if (kind === "link" ? !url : !file) {
      setError(kind === "link" ? "Nalepi link." : "Prvo dodaj dokument.");
      return;
    }
    setPending(true);
    setError("");
    try {
      const body = new FormData();
      body.set("kind", kind);
      body.set("accountEmail", email);
      if (kind === "link") body.set("url", url);
      else if (file) body.set("file", file);
      const response = await fetch("/api/profile", { method: "POST", body });
      const data = (await response.json().catch(() => null)) as {
        profile?: unknown;
        error?: string;
      } | null;
      if (!response.ok || !isCandidateProfile(data?.profile)) {
        setError(errorText(data?.error || "upstream"));
        setPending(false);
        return;
      }
      setDraft({
        ...data.profile,
        accountEmail: email,
        sourceKind: kind,
        sourceFile: kind === "link" ? url : file?.name || data.profile.sourceFile,
      });
    } catch {
      setError("Mreža nije odgovorila. Pokušaj ponovo.");
    }
    setPending(false);
  }

  return (
    <div className="flex h-full min-h-0 flex-col text-zinc-100">
      <header className="flex items-start gap-3 border-b border-white/10 px-5 py-4">
        <div className="min-w-0">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="mb-2 text-xs text-zinc-400 hover:text-zinc-100"
            >
              Nazad na oglase
            </button>
          ) : null}
          <p className="mark text-xs text-zinc-400">Kandidat</p>
          <p className="font-display mt-1 text-lg leading-tight font-semibold tracking-tight text-zinc-50">
            {intentTitle ? `Profil za ${intentTitle}` : "Profil umesto formulara"}
          </p>
          <p className="mt-1 truncate text-xs text-zinc-400">{email}</p>
        </div>
        <button
          type="button"
          onClick={() => logoutAccount()}
          className="ml-auto shrink-0 rounded-lg px-2 py-1 text-xs text-zinc-400 hover:bg-white/5 hover:text-zinc-100"
        >
          Odjavi se
        </button>
      </header>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
        <p className="max-w-sm text-sm leading-relaxed text-zinc-400">
          {intentTitle
            ? "Oglas je sačuvan. Ubaci CV ili link profila da prijava krene odmah, bez ponovnog kucanja imena i veština."
            : "Otpremi CV, pismo ili nalepi GitHub, portfolio ili link do CV-ja. AI izvlači ime, kontakt, iskustvo i veštine."}
        </p>

        <div className="grid grid-cols-3 gap-2">
          {(
            [
              ["cv", "CV"],
              ["cover", "Pismo"],
              ["link", "Link"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                if (value === kind) return;
                setKind(value);
                setDraft(null);
                setError("");
              }}
              className={`h-10 rounded-full border text-sm ${
                kind === value
                  ? "border-transparent bg-primary text-primary-foreground"
                  : "border-white/10 bg-card text-zinc-400 hover:text-zinc-100"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {kind === "link" ? (
          <label className="grid gap-1.5 text-sm">
            Link
            <span className="relative block">
              <Link2 className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-zinc-500" />
              <input
                type="url"
                inputMode="url"
                value={link}
                onChange={(event) => {
                  setLink(event.target.value);
                  setDraft(null);
                  setError("");
                }}
                placeholder="https://github.com/ime"
                className={`${fieldClass} pl-10`}
              />
            </span>
            <span className="text-xs leading-relaxed text-zinc-500">
              GitHub profil ili repo, portfolio sajt, ili CV na Google Drive-u,
              Google Docs-u ili Dropbox-u (deljen sa „Anyone with the link“).
            </span>
          </label>
        ) : (
          <label
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              takeFile(event.dataTransfer.files?.[0]);
            }}
            className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-3xl border border-dashed px-5 py-8 text-center ${
              dragging
                ? "border-primary bg-primary/10"
                : "border-white/15 bg-card"
            }`}
          >
            <input
              type="file"
              accept="application/pdf,.pdf,text/plain,.txt,.md"
              className="sr-only"
              onChange={(event) => takeFile(event.target.files?.[0])}
            />
            <span className="flex size-11 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <FileUp className="size-5" />
            </span>
            <span className="text-sm text-zinc-400">
              Prevuci PDF ili TXT, ili klikni da izabereš
            </span>
            {file ? (
              <span className="text-sm font-medium text-primary">{file.name}</span>
            ) : null}
          </label>
        )}

        {error ? (
          <p className="text-sm text-rose-300" role="alert">
            {error}
          </p>
        ) : null}

        {draft ? <ProfilePreview profile={draft} /> : null}
      </div>

      <div className="border-t border-white/10 px-5 py-4">
        {draft ? (
          <Button
            type="button"
            onClick={() => {
              saveAccountProfile(draft);
              onSaved?.();
            }}
            className="h-11 w-full rounded-full bg-primary font-medium text-primary-foreground hover:bg-primary/90"
          >
            {intentTitle ? "Sačuvaj i apliciraj" : "Nastavi na oglase"}
          </Button>
        ) : (
          <Button
            type="button"
            disabled={
              pending ||
              (kind === "link" ? !link.trim() : !file)
            }
            onClick={() => void extract()}
            className="h-11 w-full rounded-full bg-primary font-medium text-primary-foreground hover:bg-primary/90"
          >
            {pending ? <Loader2 className="animate-spin" /> : null}
            {pending
              ? kind === "link"
                ? "AI čita link…"
                : "AI čita dokument…"
              : "Izvuci podatke"}
          </Button>
        )}
      </div>
    </div>
  );
}

function ProfilePreview({ profile }: { profile: CandidateProfile }) {
  const rows = [
    ["Ime", profile.fullName],
    ["Lokacija", profile.location],
    ["Iskustvo", profile.yearsExperience],
    ["Telefon", profile.phone],
    ["Mejl iz dokumenta", profile.documentEmail],
    ...(profile.sourceKind === "link" ? [["Link", profile.sourceFile] as const] : []),
  ].filter((row) => row[1]);

  return (
    <div className="rounded-3xl border border-white/[0.06] bg-card p-4">
      <p className="mark text-xs text-zinc-400">
        {profile.sourceKind === "link" ? "Izvučeno sa linka" : "Izvučeno iz dokumenta"}
      </p>
      <dl className="mt-3 grid gap-2">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs text-zinc-500">{label}</dt>
            <dd className="text-sm break-all text-zinc-100">{value}</dd>
          </div>
        ))}
      </dl>
      {profile.summary ? (
        <p className="mt-3 text-sm leading-relaxed text-zinc-300">{profile.summary}</p>
      ) : null}
      {(profile.skills ?? []).length > 0 ? (
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {profile.skills.map((skill) => (
            <li
              key={skill}
              className="rounded-full bg-primary/15 px-2.5 py-1 text-xs text-primary"
            >
              {skill}
            </li>
          ))}
        </ul>
      ) : null}
      {(profile.experience ?? []).length > 0 ? (
        <ul className="mt-3 grid gap-1 text-sm text-zinc-300">
          {profile.experience.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : null}
      {(profile.claims ?? []).length > 0 ? (
        <div className="mt-3">
          <p className="text-xs text-zinc-500">Bot će ovo proveriti na intervjuu</p>
          <ul className="mt-1.5 grid gap-1 text-sm text-zinc-300">
            {profile.claims.map((claim) => (
              <li key={claim}>{claim}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
