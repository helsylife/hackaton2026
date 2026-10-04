import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

import { extractText } from "unpdf";

const MAX_BYTES = 1_500_000;
const MAX_CHARS = 14_000;

export type LinkFetchError =
  | "invalid_url"
  | "linkedin"
  | "link_private"
  | "link_fetch"
  | "unreadable"
  | "too_large";

type LinkFetchResult = { text: string; url: string } | { error: LinkFetchError };

function parsePublicUrl(raw: string): URL | { error: "invalid_url" } {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { error: "invalid_url" };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { error: "invalid_url" };
  }
  if (url.username || url.password) return { error: "invalid_url" };
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!host || host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) {
    return { error: "invalid_url" };
  }
  if (!host.includes(".") && !isIP(host)) return { error: "invalid_url" };
  return url;
}

function isPrivateAddress(address: string): boolean {
  const kind = isIP(address);
  if (kind === 4) {
    const [a, b] = address.split(".").map(Number);
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    return false;
  }
  if (kind === 6) {
    const lower = address.toLowerCase();
    if (lower === "::1" || lower === "::") return true;
    if (lower.startsWith("fc") || lower.startsWith("fd")) return true;
    if (/^fe[89ab]/.test(lower)) return true;
    const mapped = lower.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateAddress(mapped[1]);
    return false;
  }
  return true;
}

async function assertPublic(url: URL) {
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host)) {
    if (isPrivateAddress(host)) throw new Error("blocked");
    return;
  }
  const records = await lookup(host, { all: true });
  if (records.length === 0 || records.some((record) => isPrivateAddress(record.address))) {
    throw new Error("blocked");
  }
}

async function readBody(
  response: Response,
): Promise<{ bytes: Uint8Array } | { error: "too_large" }> {
  const length = Number(response.headers.get("content-length") || 0);
  if (length > MAX_BYTES) return { error: "too_large" as const };
  const reader = response.body?.getReader();
  if (!reader) {
    const buffer = new Uint8Array(await response.arrayBuffer());
    if (buffer.byteLength > MAX_BYTES) return { error: "too_large" as const };
    return { bytes: buffer };
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (total < MAX_BYTES) {
    const { done, value } = await reader.read();
    if (done || !value) break;
    chunks.push(value);
    total += value.byteLength;
  }
  await reader.cancel().catch(() => undefined);
  if (total > MAX_BYTES) return { error: "too_large" as const };
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk.subarray(0, bytes.length - offset), offset);
    offset += chunk.byteLength;
    if (offset >= bytes.length) break;
  }
  return { bytes };
}

async function fetchPublic(start: URL, headers: HeadersInit) {
  let current = start;
  for (let hop = 0; hop < 4; hop += 1) {
    await assertPublic(current);
    const response = await fetch(current, {
      headers,
      redirect: "manual",
      signal: AbortSignal.timeout(8000),
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new Error("fetch");
      const next = parsePublicUrl(new URL(location, current).toString());
      if ("error" in next) throw new Error("blocked");
      current = next;
      continue;
    }
    return { response, url: current };
  }
  throw new Error("fetch");
}

function decodeEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'");
}

function metaContent(html: string, key: string) {
  const pattern = new RegExp(
    `<meta[^>]+(?:property|name)=["']${key}["'][^>]*>`,
    "i",
  );
  const tag = html.match(pattern)?.[0] ?? "";
  const content = tag.match(/content=["']([^"']*)["']/i)?.[1] ?? "";
  return decodeEntities(content).replace(/\s+/g, " ").trim();
}

function htmlToText(html: string) {
  const title = decodeEntities(html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? "")
    .replace(/\s+/g, " ")
    .trim();
  const metas = ["og:title", "og:description", "description"]
    .map((key) => metaContent(html, key))
    .filter(Boolean);
  const jsonLd = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
    .map((match) => match[1].replace(/\s+/g, " ").trim())
    .filter((block) => block.length > 20)
    .slice(0, 3);
  const visible = decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
  return [title, ...metas, ...jsonLd, visible].filter(Boolean).join("\n").slice(0, MAX_CHARS);
}

function githubTarget(url: URL) {
  const host = url.hostname.replace(/^www\./, "");
  if (host !== "github.com") return null;
  const [login, repo] = url.pathname.split("/").filter(Boolean);
  if (!login || login.startsWith("@")) return null;
  const reserved = new Set([
    "settings",
    "topics",
    "explore",
    "marketplace",
    "features",
    "login",
    "signup",
    "about",
    "pricing",
    "orgs",
  ]);
  if (reserved.has(login.toLowerCase())) return null;
  return { login, repo };
}

async function githubText(target: { login: string; repo?: string }, pageUrl: string) {
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "bridge-mvp",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  const userResponse = await fetch(`https://api.github.com/users/${target.login}`, {
    headers,
    signal: AbortSignal.timeout(8000),
  });
  if (userResponse.status === 404) return { error: "link_fetch" as const };
  if (!userResponse.ok) return { error: "link_fetch" as const };
  const user = (await userResponse.json()) as {
    name?: string;
    login?: string;
    bio?: string;
    company?: string;
    location?: string;
    blog?: string;
    twitter_username?: string;
    html_url?: string;
  };
  const reposResponse = await fetch(
    `https://api.github.com/users/${target.login}/repos?sort=updated&per_page=8`,
    { headers, signal: AbortSignal.timeout(8000) },
  );
  const repos = reposResponse.ok
    ? ((await reposResponse.json()) as Array<{
        name?: string;
        description?: string | null;
        language?: string | null;
        stargazers_count?: number;
        html_url?: string;
      }>)
    : [];

  const lines = [
    `Javni profil: ${user.html_url || pageUrl}`,
    `Ime: ${user.name || ""}`,
    `Nalog: ${user.login || target.login}`,
    `Bio: ${user.bio || ""}`,
    `Kompanija: ${user.company || ""}`,
    `Lokacija: ${user.location || ""}`,
    `Sajt: ${user.blog || ""}`,
    `Twitter: ${user.twitter_username || ""}`,
    "Repozitorijumi:",
    ...repos.map(
      (repo) =>
        `- ${repo.name || "repo"}: ${repo.description || "bez opisa"} (${repo.language || "jezik nije naveden"}, ${repo.stargazers_count ?? 0} zvezdica)`,
    ),
  ];

  if (target.repo) {
    const readme = await fetch(
      `https://api.github.com/repos/${target.login}/${target.repo}/readme`,
      {
        headers: { ...headers, Accept: "application/vnd.github.raw" },
        signal: AbortSignal.timeout(8000),
      },
    );
    if (readme.ok) {
      const text = (await readme.text()).slice(0, 4000);
      lines.push(`README za ${target.login}/${target.repo}:`, text);
    }
  }

  return { text: lines.join("\n").slice(0, MAX_CHARS), url: pageUrl };
}

function directDownload(url: URL): URL {
  const host = url.hostname.replace(/^www\./, "");
  if (host === "drive.google.com") {
    const id =
      url.pathname.match(/\/file\/d\/([^/]+)/)?.[1] || url.searchParams.get("id");
    if (id) return new URL(`https://drive.google.com/uc?export=download&id=${id}`);
  }
  if (host === "docs.google.com") {
    const id = url.pathname.match(/\/document\/d\/([^/]+)/)?.[1];
    if (id) return new URL(`https://docs.google.com/document/d/${id}/export?format=txt`);
  }
  if (host === "dropbox.com" || host.endsWith(".dropbox.com")) {
    const next = new URL(url);
    next.searchParams.set("dl", "1");
    return next;
  }
  return url;
}

export async function fetchProfileLink(raw: string): Promise<LinkFetchResult> {
  const parsed = parsePublicUrl(raw);
  if ("error" in parsed) return parsed;
  if (parsed.hostname.replace(/^www\./, "").endsWith("linkedin.com")) {
    return { error: "linkedin" };
  }
  const canonical = parsed.toString();
  const github = githubTarget(parsed);
  if (github) {
    try {
      return await githubText(github, canonical);
    } catch {
      return { error: "link_fetch" };
    }
  }

  try {
    const fetched = await fetchPublic(directDownload(parsed), {
      Accept: "text/html,application/pdf,text/plain;q=0.9,*/*;q=0.8",
      "Accept-Language": "en,sr;q=0.8",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    });
    const status = fetched.response.status;
    if (fetched.url.hostname === "accounts.google.com" || status === 401 || status === 403) {
      await fetched.response.body?.cancel().catch(() => undefined);
      return { error: "link_private" };
    }
    if (!fetched.response.ok) {
      await fetched.response.body?.cancel().catch(() => undefined);
      return { error: "link_fetch" };
    }
    const body = await readBody(fetched.response);
    if ("error" in body) return { error: body.error };
    const type = fetched.response.headers.get("content-type") || "";
    const pdf =
      type.includes("application/pdf") ||
      (body.bytes.length > 4 && new TextDecoder().decode(body.bytes.subarray(0, 5)) === "%PDF-");
    if (pdf) {
      try {
        const extracted = await extractText(body.bytes, { mergePages: true });
        const text = extracted.text.replace(/\s+\n/g, "\n").trim().slice(0, MAX_CHARS);
        if (text.length < 40) return { error: "unreadable" };
        return { text, url: canonical };
      } catch {
        return { error: "unreadable" };
      }
    }
    const raw = new TextDecoder().decode(body.bytes);
    const text = type.includes("text/plain") ? raw.trim().slice(0, MAX_CHARS) : htmlToText(raw);
    if (text.length < 40) return { error: "unreadable" };
    return { text, url: canonical };
  } catch (error) {
    if (error instanceof Error && (error.message === "blocked" || error.name === "AbortError")) {
      return { error: error.message === "blocked" ? "invalid_url" : "link_fetch" };
    }
    return { error: "link_fetch" };
  }
}
