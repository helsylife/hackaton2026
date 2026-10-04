import { NextResponse } from "next/server";
import { TARGETS, type TargetFlags } from "@/lib/campaign";
import { completeText, readJson } from "@/lib/openai-server";

type BriefBody = {
  positionTitle?: string;
  techStack?: string;
  instructions?: string;
  targets?: Partial<TargetFlags>;
};

const SYSTEM = [
  "Pomažeš administratoru da sastavi intervju.",
  "Vrati samo JSON oblika {\"questions\":[{\"question\":\"\",\"expected\":\"\"}]}.",
  "Napravi tačno 4 pitanja na srpskom.",
  "Svako pitanje je jedno, kratko, razgovorno.",
  "Kandidat je već ulogovan i njegovo ime, kontakt, godine iskustva, obrazovanje i veštine su u bazi. Ne pravi pitanja koja traže te podatke (npr. kako se zoveš, predstavi se). Pitaj o konkretnom radu i načinu razmišljanja.",
  "expected je skrivena rubrika: šta dobar, autentičan odgovor sadrži i šta je slab ili sumnjiv signal.",
  "Ne piši odgovore koje bi kandidat trebalo da nauči napamet.",
  "Ako je iskrenost uključena, jedno pitanje neka bude zamka za prepisani ili AI odgovor.",
].join(" ");

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as BriefBody | null;
  const positionTitle = body?.positionTitle?.trim() ?? "";
  const techStack = body?.techStack?.trim() ?? "";
  const instructions = body?.instructions?.trim() ?? "";

  if (!positionTitle) {
    return NextResponse.json({ error: "missing_role" }, { status: 400 });
  }

  const selected = TARGETS.filter((target) => body?.targets?.[target.id] !== false)
    .map((target) => target.label)
    .join(", ");

  const user = [
    `Pozicija: ${positionTitle}`,
    techStack ? `Tehnologije: ${techStack}` : "",
    selected ? `Šta meriti: ${selected}` : "",
    instructions ? `Instrukcije administratora: ${instructions}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const text = await completeText({ system: SYSTEM, user, json: true });
  if (!text) {
    return NextResponse.json({ error: "upstream" }, { status: 503 });
  }

  try {
    const parsed = readJson(text) as {
      questions?: { question?: string; expected?: string }[];
    };
    const questions = (parsed.questions ?? [])
      .map((item) => ({
        question: item.question?.trim() ?? "",
        expected: item.expected?.trim() ?? "",
      }))
      .filter((item) => item.question && item.expected)
      .slice(0, 6);

    if (questions.length === 0) {
      return NextResponse.json({ error: "empty" }, { status: 502 });
    }

    return NextResponse.json({ questions });
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 502 });
  }
}
