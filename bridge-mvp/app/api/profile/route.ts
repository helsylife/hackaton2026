import { NextResponse } from "next/server";
import {
  normalizeProfile,
  sourceLabel,
  type DocumentKind,
} from "@/lib/candidate-profile";
import { fetchProfileLink } from "@/lib/fetch-profile-link";
import { completeText, readJson } from "@/lib/openai-server";
import { extractText } from "unpdf";

export const runtime = "nodejs";

const MAX_BYTES = 4_000_000;
const MAX_CHARS = 14_000;

async function documentText(file: File) {
  const name = file.name.toLowerCase();
  const pdf = file.type === "application/pdf" || name.endsWith(".pdf");
  const plain =
    file.type.startsWith("text/") || name.endsWith(".txt") || name.endsWith(".md");

  if (!pdf && !plain) return { error: "unsupported" as const };
  if (file.size > MAX_BYTES) return { error: "too_large" as const };

  if (plain) {
    const text = (await file.text()).replace(/\u0000/g, "").trim();
    return { text };
  }

  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const extracted = await extractText(bytes, { mergePages: true });
    const text = extracted.text.replace(/\s+\n/g, "\n").trim();
    return { text };
  } catch {
    return { error: "unreadable" as const };
  }
}

function readKind(value: FormDataEntryValue | null): DocumentKind {
  if (value === "cover") return "cover";
  if (value === "link") return "link";
  return "cv";
}

export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  const url =
    typeof form?.get("url") === "string" ? String(form.get("url")).trim() : "";
  const kind = readKind(form?.get("kind") ?? null);
  const accountEmail =
    typeof form?.get("accountEmail") === "string"
      ? String(form.get("accountEmail")).trim()
      : "";

  let source = "";
  let sourceFile = "";
  let sourceKind = kind;

  if (url) {
    sourceKind = "link";
    const fetched = await fetchProfileLink(url);
    if ("error" in fetched) {
      const status = fetched.error === "too_large" ? 413 : 400;
      return NextResponse.json({ error: fetched.error }, { status });
    }
    source = fetched.text.slice(0, MAX_CHARS).trim();
    sourceFile = fetched.url;
  } else if (file instanceof File) {
    const extracted = await documentText(file);
    if ("error" in extracted) {
      const status = extracted.error === "too_large" ? 413 : 400;
      return NextResponse.json({ error: extracted.error }, { status });
    }
    source = extracted.text.slice(0, MAX_CHARS).trim();
    sourceFile = file.name;
  } else {
    return NextResponse.json({ error: "missing_file" }, { status: 400 });
  }

  if (source.length < 40) {
    return NextResponse.json({ error: "unreadable" }, { status: 400 });
  }

  const documentLabel = sourceLabel(sourceKind);
  const system = [
    sourceKind === "link"
      ? `Izvlačiš strukturu iz javnog profila kandidata (${documentLabel}: LinkedIn, GitHub ili sajt). Tekst može biti nepotpun.`
      : `Izvlačiš strukturu iz kandidatovog dokumenta (${documentLabel}).`,
    "Vrati samo JSON sa ključevima: fullName, documentEmail, phone, location, yearsExperience, education, skills, languages, experience, claims, summary.",
    "fullName, documentEmail, phone, location, yearsExperience i summary su stringovi.",
    "education, skills, languages, experience i claims su nizovi kratkih stringova.",
    "experience: posao, uloga ili projekat u jednoj kratkoj rečenici.",
    sourceKind === "link"
      ? "claims: 3 do 5 konkretnih tvrdnji sa profila koje intervju može da proveri (godine, tehnologija, projekat, odgovornost). Bez opštih fraza."
      : "claims: 3 do 5 konkretnih tvrdnji iz dokumenta koje intervju može da proveri (godine, tehnologija, projekat, odgovornost). Bez opštih fraza.",
    sourceKind === "link"
      ? "summary: 2 rečenice na srpskom, samo ono što je javni profil stvarno rekao."
      : "summary: 2 rečenice na srpskom, samo ono što dokument stvarno kaže.",
    "Ako podatak ne postoji, vrati prazan string ili prazan niz. Ništa ne izmišljaj.",
  ].join(" ");

  const text = await completeText({
    system,
    user: source,
    json: true,
  });

  if (!text) {
    return NextResponse.json(
      { error: process.env.OPENAI_API_KEY ? "upstream" : "missing_key" },
      { status: process.env.OPENAI_API_KEY ? 502 : 503 },
    );
  }

  try {
    const profile = normalizeProfile(readJson(text), {
      sourceFile,
      sourceKind,
      accountEmail,
    });
    if (!profile) {
      return NextResponse.json({ error: "empty" }, { status: 422 });
    }
    return NextResponse.json({ profile });
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 502 });
  }
}
