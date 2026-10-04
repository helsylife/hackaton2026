import { NextResponse } from "next/server";
import {
  activeTargets,
  axesFor,
  type Campaign,
} from "@/lib/campaign";
import {
  isCandidateProfile,
  profileForPrompt,
  type CandidateProfile,
} from "@/lib/candidate-profile";
import { normalizeScore, type TranscriptMessage } from "@/lib/live-score";
import { completeText, readJson } from "@/lib/openai-server";

type AnalyzeBody = {
  messages?: TranscriptMessage[];
  campaign?: Campaign | null;
  profile?: CandidateProfile | null;
};

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as AnalyzeBody | null;
  const messages = Array.isArray(body?.messages) ? body.messages : [];
  const campaign = body?.campaign ?? null;
  const profile = isCandidateProfile(body?.profile) ? body.profile : null;
  const axes = axesFor(campaign);
  const answers = messages.filter(
    (message) => message?.sender === "candidate" && message.text?.trim(),
  );

  if (answers.length === 0) {
    return NextResponse.json({ error: "empty_transcript" }, { status: 400 });
  }

  const rubric = (campaign?.questions ?? [])
    .filter((item) => item.question?.trim())
    .map(
      (item, index) =>
        `${index + 1}. ${item.question.trim()}\nOčekivano: ${item.expected?.trim() || "nije zadato"}`,
    )
    .join("\n");

  const system = [
    "Ti si analitičar za regrutera. Ocenjuješ transkript intervjua.",
    "Vrati samo JSON: {\"scores\":{},\"summary\":\"\",\"anomaly\":false,\"cv\":[],\"reviews\":[{\"question\":\"\",\"answer\":\"\",\"opinion\":\"\"}]}.",
    `scores mora imati tačno ove ključeve, svaki broj od 0 do 100: ${axes.join(" | ")}.`,
    "summary: 2 do 4 rečenice na srpskom, konkretno, bez uvoda.",
    "anomaly je true ako stil deluje prepisano, AI-generisano ili u oštrom raskoraku sa ostalim odgovorima.",
    "cv su kratke stavke. Ako postoji profil iz dokumenta, kreni od njegovih veština i poslova. Stavku koju intervju ospori označi sa Nije potvrđeno. Stavku koju intervju potvrdi ostavi bez te oznake.",
    "Ako je znanje sumnjivo, stavka neka sadrži reč Sumnjiv.",
    "reviews: tačno jedan objekat za svaku poruku kandidata, istim redom kao u transkriptu.",
    "opinion je 1 do 2 rečenice na srpskom: šta taj odgovor pokazuje u odnosu na očekivano, bez prepisivanja celog odgovora.",
    "Ne izmišljaj alate i ne ponavljaj očekivane odgovore kao da ih je kandidat dao.",
  ].join(" ");

  const user = [
    campaign?.positionTitle ? `Pozicija: ${campaign.positionTitle}` : "",
    campaign?.techStack ? `Tehnologije: ${campaign.techStack}` : "",
    `Merenja: ${activeTargets(campaign).join(", ")}`,
    campaign?.instructions?.trim()
      ? `Instrukcije: ${campaign.instructions.trim()}`
      : "",
    rubric ? `Rubrika:\n${rubric}` : "",
    profile ? `Profil kandidata:\n${profileForPrompt(profile)}` : "",
    "Transkript:",
    messages
      .filter((message) => message?.text?.trim())
      .map(
        (message) =>
          `${message.sender === "candidate" ? "Kandidat" : "AI"}: ${message.text.trim()}`,
      )
      .join("\n"),
  ]
    .filter(Boolean)
    .join("\n\n");

  const text = await completeText({ system, user, json: true });
  if (!text) {
    return NextResponse.json({ error: "upstream" }, { status: 503 });
  }

  try {
    const score = normalizeScore(
      readJson(text) as Parameters<typeof normalizeScore>[0],
      campaign,
      messages,
    );
    if (!score) {
      return NextResponse.json({ error: "empty" }, { status: 502 });
    }
    return NextResponse.json(score);
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 502 });
  }
}
