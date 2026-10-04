import { NextResponse } from "next/server";
import { interviewQuestions, type Campaign } from "@/lib/campaign";
import {
  isCandidateProfile,
  profileForPrompt,
  sourceLabel,
  type CandidateProfile,
} from "@/lib/candidate-profile";
import { completeText } from "@/lib/openai-server";

type IncomingMessage = {
  sender: "ai" | "candidate";
  text: string;
};

type ChatBody = {
  messages?: IncomingMessage[];
  campaign?: Campaign | null;
  profile?: CandidateProfile | null;
};

function acquaintance(profile: CandidateProfile | null) {
  if (!profile) {
    return [
      "FAZA 1 (Upoznavanje): Postavi 2 do 3 kratka, opuštena pitanja (ime, godine iskustva, omiljene tehnologije) kako bi sistem generisao osnovni CV. Prva poruka sme da bude samo iz ove faze.",
      "Nikada ne postavljaj glavno tehničko pitanje u prvoj poruci!",
    ];
  }

  const source = sourceLabel(profile.sourceKind);
  const fromLink = profile.sourceKind === "link";
  return [
    fromLink
      ? "Kandidat je već ulogovan. Lični podaci i veštine su izvučeni iz javnog linka (LinkedIn, GitHub ili sajt). Ne pitaj ime, mejl, telefon, godine, obrazovanje, lokaciju ni spisak tehnologija."
      : "Kandidat je već ulogovan. Lični podaci i veštine su izvučeni iz dokumenta. Ne pitaj ime, mejl, telefon, godine, obrazovanje, lokaciju ni spisak tehnologija.",
    `Poznati profil (${source}):`,
    profileForPrompt(profile),
    fromLink
      ? "FAZA 1 (Provera): Prva poruka pozdravlja kandidata imenom, u jednoj rečenici kaže da si pogledao profil sa linka, i postavlja tačno jedno pitanje koje proverava jednu konkretnu tvrdnju iz profila. Traži objašnjenje kako je to radio, ne odgovor da/ne."
      : "FAZA 1 (Provera): Prva poruka pozdravlja kandidata imenom, u jednoj rečenici kaže da si pročitao dokument, i postavlja tačno jedno pitanje koje proverava jednu konkretnu tvrdnju iz profila. Traži objašnjenje kako je to radio, ne odgovor da/ne.",
    "Ako tvrdnja ne stoji ili je kandidat ne ume da objasni, reci to jednom kratkom rečenicom i pređi dalje. Ne skupljaj ponovo biografiju.",
    "Sve što je gore navedeno u profilu već imamo u bazi. Ni u jednoj fazi ne traži te podatke ponovo, čak ni ako ih pitanje administratora pominje: preskoči taj deo i pitaj samo ono što profil ne pokriva.",
    "FAZA 2 počinje tek posle te provere. Ne postavljaj glavno tehničko pitanje u istoj poruci kao proveru.",
  ];
}

function systemPrompt(campaign: Campaign | null, profile: CandidateProfile | null) {
  const questions = interviewQuestions(campaign, profile);
  const mainQuestion =
    questions[0]?.question.trim() ||
    campaign?.instructions.trim() ||
    "Zamisli da imamo e-commerce aplikaciju. Objani kako bi je složio i gde bi pazio na performanse, podatke i greške.";

  const lines = [
    "Ti si tehnički regruter kompanije.",
    "Govoriš srpski, kratko i opušteno.",
    "Tvoj intervju se sastoji iz faza. Dok traje, posle svakog odgovora postavi tačno jedno sledeće pitanje.",
    "Svaku poruku počni oznakom faze u uglastim zagradama, bez teksta ispred nje: [P] za fazu upoznavanja ili provere, [1], [2], [3]... za redni broj tehničkog pitanja administratora na koje se poruka odnosi (ista oznaka važi i kad tražiš pojašnjenje ili dodatne detalje za to pitanje), [K] za završnu poruku. Kandidat tu oznaku ne vidi.",
    "Ne ocenjuj u chatu i ne otkrivaj očekivane odgovore.",
    "Nema duplih pitanja: ne postavljaj pitanje koje si već postavio u ovom razgovoru, ni pitanje na koje odgovor već znaš iz profila ili iz ranijih odgovora kandidata.",
    "Tehničko pitanje je odgovoreno tek kad dobiješ sve informacije koje ono traži (vodi se očekivanim odgovorom). Dok ih ne dobiješ, ostani na istom pitanju: traži pojašnjenje, konkretan primer ili deo koji nedostaje, i zadrži istu oznaku. Ne prelazi na sledeće pitanje sa polovičnim odgovorom. Jedini izuzetak: ako kandidat izričito kaže da ne zna, zabeleži to i pređi dalje.",
    "Ne postavljaj nijedno tehničko pitanje koje administrator nije zadao i ne otvaraj nove teme. Kad su sva zadata pitanja odgovorena, odmah pređi na završetak.",
    "Ako kandidat koristi uvredljiv jezik, ne komentariši to i ne upozoravaj. Sistem to već radi. Nastavi intervju kao da te poruke nema.",
    ...acquaintance(profile),
    `FAZA 2 (Tehnički izazov): ${profile ? "Tek kada je provera tvrdnje gotova" : "Tek kada dobiješ osnovne informacije"}, pređi na glavno tehničko pitanje koje je zadao administrator: ${mainQuestion}`,
  ];

  if (campaign?.positionTitle.trim()) {
    lines.push(`Pozicija: ${campaign.positionTitle.trim()}.`);
  }
  if (campaign?.techStack.trim()) {
    lines.push(`Tehnologije: ${campaign.techStack.trim()}.`);
  }
  if (campaign?.instructions.trim()) {
    lines.push(
      `Skrivene instrukcije administratora, ne govoriti kandidatu: ${campaign.instructions.trim()}`,
    );
  }

  questions.slice(1).forEach((item, index) => {
    lines.push(
      `Dodatno tehničko pitanje ${index + 2}, tek posle glavnog: ${item.question.trim()}`,
    );
  });
  questions.forEach((item, index) => {
    if (item.expected?.trim()) {
      lines.push(
        `Očekuje se za pitanje ${index + 1}, ne govoriti kandidatu: ${item.expected.trim()}`,
      );
    }
  });

  lines.push(
    "FAZA 3 (Završetak): Kad su provera i sva tehnička pitanja odgovorena, pošalji poruku sa oznakom [K]: zahvali se u jednoj kratkoj rečenici i reci da je intervju gotov. Ne postavljaj novo pitanje.",
  );

  return lines.join("\n");
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as ChatBody | null;
  const messages = Array.isArray(body?.messages) ? body.messages : [];
  const profile = isCandidateProfile(body?.profile) ? body.profile : null;
  const reply = await completeText({
    system: systemPrompt(body?.campaign ?? null, profile),
    messages: messages
      .filter((message) => message.text?.trim())
      .map((message) => ({
        role: message.sender === "candidate" ? ("user" as const) : ("assistant" as const),
        content: message.text.trim(),
      })),
  });

  if (!reply) {
    return NextResponse.json(
      { error: process.env.OPENAI_API_KEY ? "upstream" : "missing_key" },
      { status: process.env.OPENAI_API_KEY ? 502 : 503 },
    );
  }

  return NextResponse.json({ reply });
}
