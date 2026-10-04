const TERMS = [
  "jebem",
  "jebote",
  "jebo",
  "jebi",
  "jebiga",
  "jebac",
  "jebeni",
  "jebeno",
  "jebena",
  "jebemti",
  "odjebi",
  "odjeb",
  "kurac",
  "kurcu",
  "kurce",
  "kurcinu",
  "picka",
  "picke",
  "picku",
  "picko",
  "pizda",
  "pizdo",
  "pizdu",
  "sranje",
  "seronja",
  "seronjo",
  "govno",
  "govna",
  "govnar",
  "kurva",
  "kurvo",
  "kurve",
  "peder",
  "pederu",
  "pederi",
  "debil",
  "debilu",
  "kreten",
  "kretenu",
  "djubre",
  "idiot",
  "idiote",
  "fuck",
  "fucking",
  "fucker",
  "motherfucker",
  "shit",
  "bullshit",
  "bitch",
  "asshole",
  "dickhead",
  "cunt",
  "nigga",
  "nigger",
  "faggot",
  "retard",
  "whore",
] as const;

const PATTERNS = TERMS.map(
  (term) => new RegExp(`(?:^|[^a-z])${term}(?:[^a-z]|$)`),
);

export const CONDUCT_WARNING =
  "Upozorenje: uvredljiv jezik nije dozvoljen u intervjuu. Sledeći put ćeš biti isključen.";

export const CONDUCT_EXCLUSION =
  "Isključen si iz intervjua jer si ponovo koristio uvredljiv jezik.";

function fold(text: string) {
  return text
    .toLowerCase()
    .replace(/đ/g, "dj")
    .replace(/[čć]/g, "c")
    .replace(/š/g, "s")
    .replace(/ž/g, "z")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/@/g, "a")
    .replace(/\$/g, "s")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function leetTokens(text: string) {
  return text
    .split(" ")
    .map((token) => {
      if (!/[a-z]/.test(token) || !/\d/.test(token)) return token;
      return token
        .replace(/0/g, "o")
        .replace(/1/g, "i")
        .replace(/3/g, "e")
        .replace(/4/g, "a")
        .replace(/5/g, "s")
        .replace(/7/g, "t");
    })
    .join(" ");
}

function collapseRepeats(text: string) {
  return text.replace(/([a-z])\1+/g, "$1");
}

function joinSingleLetters(text: string) {
  let current = text;
  let next = current.replace(/\b([a-z])\s+(?=[a-z]\b)/g, "$1");
  while (next !== current) {
    current = next;
    next = current.replace(/\b([a-z])\s+(?=[a-z]\b)/g, "$1");
  }
  return current;
}

function matches(text: string) {
  const joined = joinSingleLetters(text);
  return PATTERNS.some((pattern) => pattern.test(joined));
}

export function hasOffensiveLanguage(text: string) {
  const folded = leetTokens(fold(text));
  return (
    matches(folded) ||
    matches(folded.replace(/([a-z])\1{2,}/g, "$1")) ||
    matches(collapseRepeats(folded))
  );
}
