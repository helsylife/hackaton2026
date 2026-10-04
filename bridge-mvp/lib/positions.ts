import type { Campaign } from "@/lib/campaign";
import type { CandidateProfile } from "@/lib/candidate-profile";

export type OpenRole = {
  id: string;
  title: string;
  team: string;
  location: string;
  stack: string;
  summary: string;
  salary: string;
  type: string;
  live?: boolean;
};

export type SuggestedRole = OpenRole & {
  match: number;
  why: string;
};

export const OPEN_ROLES: OpenRole[] = [
  {
    id: "dba",
    title: "Database Administrator",
    team: "Platform",
    location: "Beograd · hibrid",
    stack: "MySQL, SQLAlchemy, Python",
    summary:
      "Brineš o bazama, replikaciji i incidentima dok produkcija prima saobraćaj.",
    salary: "180–240k RSD",
    type: "Puno radno vreme",
  },
  {
    id: "backend",
    title: "Junior Backend Engineer",
    team: "Product",
    location: "Beograd · remote",
    stack: "Node.js, PostgreSQL",
    summary: "Gradiš API-je i radiš sa podacima iza produkta.",
    salary: "110–150k RSD",
    type: "Puno radno vreme",
  },
  {
    id: "frontend",
    title: "Frontend Engineer",
    team: "Product",
    location: "Novi Sad · kancelarija",
    stack: "React, TypeScript, Next.js",
    summary: "Praviš interfejs koji kandidat i regruter koriste svaki dan.",
    salary: "160–220k RSD",
    type: "Puno radno vreme",
  },
  {
    id: "data",
    title: "Data Analyst",
    team: "Insights",
    location: "Beograd · hibrid",
    stack: "SQL, Python, dbt",
    summary: "Pretvaraš sirove događaje u odluke koje tim može da brani.",
    salary: "150–200k RSD",
    type: "Puno radno vreme",
  },
  {
    id: "devops",
    title: "DevOps Engineer",
    team: "Platform",
    location: "Remote",
    stack: "Kubernetes, Terraform, AWS",
    summary: "Držiš isporuku i infrastrukturu stabilnom kad saobraćaj skoči.",
    salary: "190–260k RSD",
    type: "Puno radno vreme",
  },
  {
    id: "qa",
    title: "QA Engineer",
    team: "Product",
    location: "Beograd · hibrid",
    stack: "Playwright, TypeScript, CI",
    summary: "Hvataš regresije pre nego što stignu do korisnika.",
    salary: "140–190k RSD",
    type: "Puno radno vreme",
  },
  {
    id: "mobile",
    title: "Mobile Engineer",
    team: "Product",
    location: "Remote",
    stack: "React Native, TypeScript",
    summary: "Isti proizvod, isti nalog, samo na telefonu.",
    salary: "180–240k RSD",
    type: "Puno radno vreme",
  },
  {
    id: "security",
    title: "Security Engineer",
    team: "Platform",
    location: "Beograd · kancelarija",
    stack: "AppSec, AWS, Python",
    summary: "Čuvaš naloge, sesije i podatke koji prolaze kroz prijavu.",
    salary: "200–270k RSD",
    type: "Puno radno vreme",
  },
];

function sameTitle(left: string, right: string) {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

export function catalog(campaign: Campaign | null): OpenRole[] {
  const title = campaign?.positionTitle.trim() ?? "";
  if (!title) return OPEN_ROLES;

  const match = OPEN_ROLES.find((role) => sameTitle(role.title, title));
  if (match) {
    return OPEN_ROLES.map((role) =>
      role.id === match.id
        ? {
            ...role,
            stack: campaign?.techStack.trim() || role.stack,
            live: true,
          }
        : role,
    );
  }

  return [
    {
      id: "live",
      title,
      team: "Otvorena kampanja",
      location: "Prijava odmah",
      stack: campaign?.techStack.trim() || "Po dogovoru",
      summary: "Pozicija koju je administrator upravo objavio.",
      salary: "Po dogovoru",
      type: "Puno radno vreme",
      live: true,
    },
    ...OPEN_ROLES,
  ];
}

export function filterRoles(roles: OpenRole[], query: string) {
  const needle = query.trim().toLowerCase();
  if (needle.length < 2) return [];
  return roles.filter((role) => roleHaystack(role).includes(needle));
}

function roleHaystack(role: OpenRole) {
  return [role.title, role.team, role.location, role.stack, role.summary, role.salary, role.type]
    .join(" ")
    .toLowerCase();
}

function profileHaystack(profile: CandidateProfile) {
  return [
    profile.skills.join(" "),
    profile.summary,
    profile.experience.join(" "),
    profile.yearsExperience,
    profile.education.join(" "),
  ]
    .join(" ")
    .toLowerCase();
}

function needlesFor(role: OpenRole) {
  const skip = new Set([
    "and",
    "the",
    "for",
    "junior",
    "senior",
    "engineer",
    "puno",
    "radno",
    "vreme",
  ]);
  return [
    ...new Set(
      `${role.stack} ${role.title}`
        .toLowerCase()
        .split(/[^a-z0-9+#]+/i)
        .filter((token) => token.length > 2 && !skip.has(token)),
    ),
  ];
}

function explain(role: OpenRole, profile: CandidateProfile | null) {
  if (!profile) {
    return {
      match: role.live ? 90 : 64,
      why: role.live ? "Upravo objavljeno" : "Otvoren oglas",
    };
  }

  const hay = profileHaystack(profile);
  const needles = needlesFor(role);
  const hits = needles.filter((token) => hay.includes(token));
  const ratio = needles.length ? hits.length / needles.length : 0;
  const match = Math.max(42, Math.min(97, Math.round(48 + ratio * 46 + (role.live ? 6 : 0))));
  const why = hits.length
    ? `Poklapa se: ${hits.slice(0, 2).join(", ")}`
    : role.live
      ? "Nova otvorena kampanja"
      : "Otvoren oglas u timu";
  return { match, why };
}

export function suggestRoles(
  roles: OpenRole[],
  query: string,
  profile: CandidateProfile | null,
): SuggestedRole[] {
  const needle = query.trim().toLowerCase();
  const pool =
    needle.length < 2 ? roles : roles.filter((role) => roleHaystack(role).includes(needle));

  return pool
    .map((role) => ({ ...role, ...explain(role, profile) }))
    .sort((left, right) => right.match - left.match || Number(Boolean(right.live)) - Number(Boolean(left.live)));
}
