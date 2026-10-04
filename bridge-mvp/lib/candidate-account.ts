import {
  isCandidateProfile,
  type CandidateProfile,
} from "@/lib/candidate-profile";

export type CandidateAccount = {
  id: string;
  email: string;
  passwordHash: string;
  profile: CandidateProfile | null;
  createdAt: number;
};

type AccountStore = {
  sessionId: string | null;
  accounts: CandidateAccount[];
};

const STORAGE_KEY = "bridge.accounts";
const EMPTY_STORE: AccountStore = { sessionId: null, accounts: [] };

function isAccount(value: unknown): value is CandidateAccount {
  if (!value || typeof value !== "object") return false;
  const item = value as CandidateAccount;
  return (
    typeof item.id === "string" &&
    typeof item.email === "string" &&
    typeof item.passwordHash === "string"
  );
}

function parseStore(raw: string | null): AccountStore {
  if (!raw) return EMPTY_STORE;
  try {
    const parsed = JSON.parse(raw) as Partial<AccountStore>;
    const accounts = Array.isArray(parsed.accounts)
      ? parsed.accounts.filter(isAccount).map((item) => ({
          id: item.id,
          email: item.email,
          passwordHash: item.passwordHash,
          profile:
            item.profile && isCandidateProfile(item.profile) ? item.profile : null,
          createdAt: item.createdAt || Date.now(),
        }))
      : [];
    const sessionId =
      typeof parsed.sessionId === "string" &&
      accounts.some((item) => item.id === parsed.sessionId)
        ? parsed.sessionId
        : null;
    return { sessionId, accounts };
  } catch {
    return EMPTY_STORE;
  }
}

let cacheRaw: string | null | undefined;
let cacheStore: AccountStore = EMPTY_STORE;
const listeners = new Set<() => void>();

function readStore(): AccountStore {
  if (typeof window === "undefined") return EMPTY_STORE;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw === cacheRaw) return cacheStore;
  cacheRaw = raw;
  cacheStore = parseStore(raw);
  return cacheStore;
}

function writeStore(store: AccountStore) {
  const raw = JSON.stringify(store);
  window.localStorage.setItem(STORAGE_KEY, raw);
  cacheRaw = raw;
  cacheStore = store;
  listeners.forEach((listener) => listener());
}

export function getSessionSnapshot(): CandidateAccount | null {
  const store = readStore();
  if (!store.sessionId) return null;
  return store.accounts.find((item) => item.id === store.sessionId) ?? null;
}

export function getSessionServerSnapshot(): CandidateAccount | null {
  return null;
}

export function subscribeAccounts(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function getSessionProfile(): CandidateProfile | null {
  return getSessionSnapshot()?.profile ?? null;
}

async function hashPassword(email: string, password: string) {
  const data = new TextEncoder().encode(`${email}::${password}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export async function registerAccount(email: string, password: string) {
  const normalized = normalizeEmail(email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    return { ok: false as const, error: "Unesi ispravan mejl." };
  }
  if (password.length < 6) {
    return { ok: false as const, error: "Lozinka mora imati bar 6 karaktera." };
  }

  const store = readStore();
  if (store.accounts.some((item) => item.email === normalized)) {
    return {
      ok: false as const,
      error: "Nalog sa tim mejlom već postoji. Uloguj se.",
    };
  }

  const account: CandidateAccount = {
    id: `acc-${Date.now().toString(36)}`,
    email: normalized,
    passwordHash: await hashPassword(normalized, password),
    profile: null,
    createdAt: Date.now(),
  };
  writeStore({
    sessionId: account.id,
    accounts: [...store.accounts, account],
  });
  return { ok: true as const };
}

export async function loginAccount(email: string, password: string) {
  const normalized = normalizeEmail(email);
  if (!normalized || !password) {
    return { ok: false as const, error: "Unesi mejl i lozinku." };
  }

  const store = readStore();
  const account = store.accounts.find((item) => item.email === normalized);
  if (!account) {
    return { ok: false as const, error: "Nalog ne postoji. Registruj se." };
  }

  const passwordHash = await hashPassword(normalized, password);
  if (passwordHash !== account.passwordHash) {
    return { ok: false as const, error: "Pogrešna lozinka." };
  }

  writeStore({ ...store, sessionId: account.id });
  return { ok: true as const };
}

export function logoutAccount() {
  const store = readStore();
  writeStore({ ...store, sessionId: null });
}

export function saveAccountProfile(profile: CandidateProfile) {
  const store = readStore();
  if (!store.sessionId) return;
  writeStore({
    ...store,
    accounts: store.accounts.map((item) =>
      item.id === store.sessionId ? { ...item, profile } : item,
    ),
  });
}

export function clearAccountProfile() {
  const store = readStore();
  if (!store.sessionId) return;
  writeStore({
    ...store,
    accounts: store.accounts.map((item) =>
      item.id === store.sessionId ? { ...item, profile: null } : item,
    ),
  });
}
