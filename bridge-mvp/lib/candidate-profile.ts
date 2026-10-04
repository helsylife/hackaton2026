export type DocumentKind = "cv" | "cover" | "link";

export function sourceLabel(kind: DocumentKind) {
  if (kind === "cover") return "motivaciono pismo";
  if (kind === "link") return "javni profil";
  return "CV";
}

export type CandidateProfile = {
  fullName: string;
  documentEmail: string;
  phone: string;
  location: string;
  yearsExperience: string;
  education: string[];
  skills: string[];
  languages: string[];
  experience: string[];
  claims: string[];
  summary: string;
  sourceFile: string;
  sourceKind: DocumentKind;
  accountEmail: string;
};

function text(value: unknown) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function list(value: unknown, max: number) {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const items: string[] = [];
  for (const entry of value) {
    const item = text(entry);
    const key = item.toLowerCase();
    if (!item || seen.has(key)) continue;
    seen.add(key);
    items.push(item);
    if (items.length >= max) break;
  }
  return items;
}

export function normalizeProfile(
  value: unknown,
  meta: { sourceFile: string; sourceKind: DocumentKind; accountEmail: string },
): CandidateProfile | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const profile: CandidateProfile = {
    fullName: text(raw.fullName),
    documentEmail: text(raw.documentEmail),
    phone: text(raw.phone),
    location: text(raw.location),
    yearsExperience: text(raw.yearsExperience),
    education: list(raw.education, 6),
    skills: list(raw.skills, 16),
    languages: list(raw.languages, 8),
    experience: list(raw.experience, 8),
    claims: list(raw.claims, 6),
    summary: text(raw.summary),
    sourceFile: meta.sourceFile,
    sourceKind: meta.sourceKind,
    accountEmail: meta.accountEmail,
  };

  const hasSignal =
    profile.fullName ||
    profile.skills.length > 0 ||
    profile.experience.length > 0 ||
    profile.summary.length > 40;

  return hasSignal ? profile : null;
}

export function isCandidateProfile(value: unknown): value is CandidateProfile {
  if (!value || typeof value !== "object") return false;
  const item = value as CandidateProfile;
  return typeof item.fullName === "string" && Array.isArray(item.skills);
}

function join(items: string[] | undefined, separator: string) {
  return Array.isArray(items) && items.length ? items.join(separator) : "nije navedeno";
}

export function profileForPrompt(profile: CandidateProfile) {
  const source = sourceLabel(profile.sourceKind);
  return [
    `Izvor: ${source} (${profile.sourceFile || "dokument"})`,
    `Ime: ${profile.fullName || "nije navedeno"}`,
    `Mejl naloga: ${profile.accountEmail || "nije navedeno"}`,
    `Mejl iz dokumenta: ${profile.documentEmail || "nije navedeno"}`,
    `Telefon: ${profile.phone || "nije navedeno"}`,
    `Lokacija: ${profile.location || "nije navedeno"}`,
    `Iskustvo: ${profile.yearsExperience || "nije navedeno"}`,
    `Obrazovanje: ${join(profile.education, "; ")}`,
    `Veštine: ${join(profile.skills, ", ")}`,
    `Jezici: ${join(profile.languages, ", ")}`,
    `Poslovi: ${join(profile.experience, " | ")}`,
    `Tvrdnje za proveru: ${join(profile.claims, " | ")}`,
    `Sažetak: ${profile.summary || "nije navedeno"}`,
  ].join("\n");
}
