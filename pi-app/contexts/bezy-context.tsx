"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePiAuth } from "@/contexts/pi-auth-context";
import { pi } from "@/lib/pi";
import { KeyWriter } from "@/lib/bezy/store";
import {
  KEYS,
  PREMIUM_MS,
  SEED_PROFILES,
  buildDiscovery,
  consentToBlob,
  decisionsToBlob,
  defaultPrefs,
  emptyConsent,
  emptyPremium,
  emptyProfile,
  idsToBlob,
  isPremiumActive as computeIsPremiumActive,
  makeId,
  matchesToBlob,
  modLogToBlob,
  premiumToBlob,
  prefsToBlob,
  profileComplete,
  profileToBlob,
  reportsToBlob,
  safetyToBlob,
  sanitizeConsent,
  sanitizeDecisions,
  sanitizeIds,
  sanitizeMatches,
  sanitizeModLog,
  sanitizePremium,
  sanitizePrefs,
  sanitizeProfile,
  sanitizeReports,
  sanitizeSafety,
  sanitizeThreads,
  threadsToBlob,
  MAX_MESSAGES_PER_THREAD,
  type ConsentState,
  type DatingPrefs,
  type DatingProfile,
  type Match,
  type Message,
  type ModAction,
  type ModActionLog,
  type PremiumState,
  type Report,
  type ReportReason,
  type SafetyRecord,
  type SeedProfile,
  type ThreadsState,
} from "@/lib/bezy/data";

export interface Toast {
  id: string;
  text: string;
  tone?: "default" | "rose" | "danger";
}

interface BezyContextValue {
  ready: boolean;
  storageTrouble: boolean;

  consent: ConsentState;
  profile: DatingProfile | null;
  prefs: DatingPrefs;
  matches: Match[];
  threads: ThreadsState;
  reports: Report[];
  blocked: string[];
  modLog: ModActionLog[];
  safety: SafetyRecord[];

  // premium
  premium: PremiumState;
  isPremiumActive: boolean;
  activatePremium: (paymentId: string, txid: string) => void;

  // discovery
  discovery: SeedProfile[];
  getSeed: (id: string) => SeedProfile | undefined;

  // onboarding + profile
  completeOnboarding: (profile: DatingProfile, prefs: DatingPrefs) => void;
  saveProfile: (profile: DatingProfile) => void;
  savePrefs: (prefs: DatingPrefs) => void;

  // discovery actions
  likeProfile: (id: string) => { matched: boolean; match?: Match };
  passProfile: (id: string) => void;

  // matches + messaging
  getMatch: (matchId: string) => Match | undefined;
  matchForProfile: (profileId: string) => Match | undefined;
  messagesFor: (matchId: string) => Message[];
  unreadCount: number;
  unreadFor: (matchId: string) => boolean;
  markMomentSeen: (matchId: string) => void;
  acknowledgeGuard: (matchId: string) => void;
  isGuardAcknowledged: (matchId: string) => boolean;
  markRead: (matchId: string) => void;
  sendMessage: (matchId: string, text: string) => void;
  unmatch: (matchId: string) => void;

  // safety
  blockProfile: (id: string, name: string) => void;
  reportProfile: (id: string, name: string, reason: ReportReason, note: string) => void;
  moderate: (reportId: string, action: ModAction) => void;

  // account
  deleteAccount: () => Promise<void>;

  // toasts
  toasts: Toast[];
  toast: (text: string, tone?: Toast["tone"]) => void;
}

const BezyContext = createContext<BezyContextValue | null>(null);

export function useBezy(): BezyContextValue {
  const ctx = useContext(BezyContext);
  if (!ctx) throw new Error("useBezy must be used within BezyProvider");
  return ctx;
}

const seedMap = new Map(SEED_PROFILES.map((s) => [s.id, s]));

export function BezyProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = usePiAuth();

  const [ready, setReady] = useState(false);
  const [storageTrouble, setStorageTrouble] = useState(false);

  const [consent, setConsent] = useState<ConsentState>(emptyConsent());
  const [profile, setProfile] = useState<DatingProfile | null>(null);
  const [prefs, setPrefs] = useState<DatingPrefs>(defaultPrefs());
  const [matches, setMatches] = useState<Match[]>([]);
  const [threads, setThreads] = useState<ThreadsState>({ byMatch: {}, read: {}, greeted: [] });
  const [reports, setReports] = useState<Report[]>([]);
  const [blocked, setBlocked] = useState<string[]>([]);
  const [modLog, setModLog] = useState<ModActionLog[]>([]);
  const [safety, setSafety] = useState<SafetyRecord[]>([]);
  const [likes, setLikes] = useState<string[]>([]);
  const [passes, setPasses] = useState<string[]>([]);
  const [premium, setPremium] = useState<PremiumState>(emptyPremium());
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [now, setNow] = useState(() => Date.now());

  // Authoritative refs so writers always serialize the latest snapshot.
  const consentRef = useRef(consent);
  const profileRef = useRef(profile);
  const prefsRef = useRef(prefs);
  const matchesRef = useRef(matches);
  const threadsRef = useRef(threads);
  const reportsRef = useRef(reports);
  const blockedRef = useRef(blocked);
  const modLogRef = useRef(modLog);
  const safetyRef = useRef(safety);
  const likesRef = useRef(likes);
  const passesRef = useRef(passes);
  const premiumRef = useRef(premium);

  consentRef.current = consent;
  profileRef.current = profile;
  prefsRef.current = prefs;
  matchesRef.current = matches;
  threadsRef.current = threads;
  reportsRef.current = reports;
  blockedRef.current = blocked;
  modLogRef.current = modLog;
  safetyRef.current = safety;
  likesRef.current = likes;
  passesRef.current = passes;
  premiumRef.current = premium;

  // Recheck expiry once a minute so an active period naturally flips to expired
  // without needing a reload.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);

  const writerRef = useRef<KeyWriter | null>(null);
  if (!writerRef.current) {
    writerRef.current = new KeyWriter((trouble) => setStorageTrouble(trouble));
  }
  const writer = writerRef.current;


  function toast(text: string, tone: Toast["tone"] = "default") {
    const id = makeId("t");
    setToasts((prev) => [...prev, { id, text, tone }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3200);
  }

  // ---- load ----
  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    (async () => {
      try {
        const [c, p, pr, dec, m, th, rep, bl, ml, sf, pm] = await Promise.all([
          pi.userState.get(KEYS.consent),
          pi.userState.get(KEYS.profile),
          pi.userState.get(KEYS.prefs),
          pi.userState.get(KEYS.decisions),
          pi.userState.get(KEYS.matches),
          pi.userState.get(KEYS.threads),
          pi.userState.get(KEYS.reports),
          pi.userState.get(KEYS.blocks),
          pi.userState.get(KEYS.modlog),
          pi.userState.get(KEYS.safety),
          pi.userState.get(KEYS.premium),
        ]);
        if (cancelled) return;
        setConsent(sanitizeConsent(c));
        setProfile(sanitizeProfile(p));
        setPrefs(sanitizePrefs(pr));
        const decisions = sanitizeDecisions(dec);
        setLikes(decisions.likes);
        setPasses(decisions.passes);
        setMatches(sanitizeMatches(m));
        setThreads(sanitizeThreads(th));
        setReports(sanitizeReports(rep));
        setBlocked(sanitizeIds(bl));
        setModLog(sanitizeModLog(ml));
        setSafety(sanitizeSafety(sf));
        setPremium(sanitizePremium(pm));
      } catch {
        // Fresh start on load error; nothing is overwritten until a save happens.
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  // ---- flush on hide ----
  useEffect(() => {
    const flush = () => writer.flushNow();
    const onVis = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [writer]);

  // ---- persistence helpers ----
  function persistConsent(next: ConsentState) {
    consentRef.current = next;
    setConsent(next);
    writer.schedule(KEYS.consent, () => consentToBlob(consentRef.current), true);
  }
  function persistProfile(next: DatingProfile) {
    profileRef.current = next;
    setProfile(next);
    writer.schedule(KEYS.profile, () => profileToBlob(profileRef.current as DatingProfile), true);
  }
  function persistPrefs(next: DatingPrefs) {
    prefsRef.current = next;
    setPrefs(next);
    writer.schedule(KEYS.prefs, () => prefsToBlob(prefsRef.current), true);
  }
  function persistDecisions() {
    writer.schedule(
      KEYS.decisions,
      () => decisionsToBlob({ likes: likesRef.current, passes: passesRef.current }),
      true,
    );
  }
  function persistMatches() {
    writer.schedule(KEYS.matches, () => matchesToBlob(matchesRef.current), true);
  }
  function persistThreads(immediate = false) {
    writer.schedule(KEYS.threads, () => threadsToBlob(threadsRef.current), immediate);
  }
  function persistReports() {
    writer.schedule(KEYS.reports, () => reportsToBlob(reportsRef.current), true);
  }
  function persistBlocked() {
    writer.schedule(KEYS.blocks, () => idsToBlob(blockedRef.current), true);
  }
  function persistModLog() {
    writer.schedule(KEYS.modlog, () => modLogToBlob(modLogRef.current), true);
  }
  function persistSafety() {
    writer.schedule(KEYS.safety, () => safetyToBlob(safetyRef.current), true);
  }
  function persistPremium(next: PremiumState) {
    premiumRef.current = next;
    setPremium(next);
    writer.schedule(KEYS.premium, () => premiumToBlob(premiumRef.current), true);
  }

  /**
   * Called only after a Pi payment for the Premium product has been confirmed
   * (sdk.makePurchase resolved with ok:true). Renewing while still active extends
   * from the current expiry rather than from today, so nothing is lost.
   */
  function activatePremium(paymentId: string, txid: string) {
    const base = Math.max(Date.now(), premiumRef.current.expiresAt);
    persistPremium({
      active: true,
      expiresAt: base + PREMIUM_MS,
      purchasedAt: Date.now(),
      lastPaymentId: paymentId,
      lastTxid: txid,
    });
  }

  // ---- derived: discovery ----
  const reportedIds = useMemo(() => new Set(reports.map((r) => r.profileId)), [reports]);
  const matchedIds = useMemo(() => new Set(matches.map((m) => m.profileId)), [matches]);

  const discovery = useMemo(() => {
    if (!profile || !profileComplete(profile) || prefs.paused) return [];
    return buildDiscovery({
      profile,
      prefs,
      likes: new Set(likes),
      passes: new Set(passes),
      matchedIds,
      blocked: new Set(blocked),
      reported: reportedIds,
    });
  }, [profile, prefs, likes, passes, matchedIds, blocked, reportedIds]);

  // ---- actions ----
  function completeOnboarding(p: DatingProfile, pr: DatingPrefs) {
    const now = Date.now();
    const full: DatingProfile = { ...p, createdAt: now, updatedAt: now };
    persistProfile(full);
    persistPrefs(pr);
    persistConsent({ adult: true, agreed: true, onboarded: true, at: now });
  }

  function saveProfile(p: DatingProfile) {
    persistProfile({ ...p, updatedAt: Date.now(), createdAt: profileRef.current?.createdAt || Date.now() });
    toast("Profile saved", "rose");
  }

  function savePrefs(pr: DatingPrefs) {
    persistPrefs(pr);
  }

  function likeProfile(id: string): { matched: boolean; match?: Match } {
    if (!likesRef.current.includes(id)) {
      const nextLikes = [...likesRef.current, id];
      likesRef.current = nextLikes;
      setLikes(nextLikes);
      persistDecisions();
    }
    // A match can only be created once both sides' likes are known. Bezy's storage is
    // scoped privately per Pi account with no shared backend yet to detect that the
    // other real Pioneer liked back, so liking someone only records the decision here —
    // it never fabricates a match.
    return { matched: false };
  }

  function passProfile(id: string) {
    if (!passesRef.current.includes(id)) {
      const next = [...passesRef.current, id];
      passesRef.current = next;
      setPasses(next);
      persistDecisions();
    }
  }

  function getMatch(matchId: string) {
    return matchesRef.current.find((m) => m.id === matchId);
  }
  function matchForProfile(profileId: string) {
    return matchesRef.current.find((m) => m.profileId === profileId);
  }
  function messagesFor(matchId: string): Message[] {
    return threads.byMatch[matchId] ?? [];
  }

  function markMomentSeen(matchId: string) {
    const next = matchesRef.current.map((m) =>
      m.id === matchId ? { ...m, seenMoment: true } : m,
    );
    matchesRef.current = next;
    setMatches(next);
    persistMatches();
  }

  function acknowledgeGuard(matchId: string) {
    if (threadsRef.current.greeted.includes(matchId)) return;
    const next: ThreadsState = {
      ...threadsRef.current,
      greeted: [...threadsRef.current.greeted, matchId],
    };
    threadsRef.current = next;
    setThreads(next);
    persistThreads(true);
  }
  function isGuardAcknowledged(matchId: string) {
    return threads.greeted.includes(matchId);
  }

  function markRead(matchId: string) {
    const msgs = threadsRef.current.byMatch[matchId] ?? [];
    const last = msgs.length ? msgs[msgs.length - 1].at : Date.now();
    if ((threadsRef.current.read[matchId] ?? 0) >= last) return;
    const next: ThreadsState = {
      ...threadsRef.current,
      read: { ...threadsRef.current.read, [matchId]: Date.now() },
    };
    threadsRef.current = next;
    setThreads(next);
    persistThreads();
  }

  function appendMessage(matchId: string, msg: Message) {
    const current = threadsRef.current.byMatch[matchId] ?? [];
    const capped = [...current, msg].slice(-MAX_MESSAGES_PER_THREAD);
    const next: ThreadsState = {
      ...threadsRef.current,
      byMatch: { ...threadsRef.current.byMatch, [matchId]: capped },
    };
    threadsRef.current = next;
    setThreads(next);
  }

  function sendMessage(matchId: string, text: string) {
    const clean = text.trim();
    if (!clean) return;
    const match = matchesRef.current.find((m) => m.id === matchId);
    if (!match) return;
    const now = Date.now();
    appendMessage(matchId, { id: makeId("m"), from: "me", text: clean, at: now });
    // Mark my own message as read.
    threadsRef.current = {
      ...threadsRef.current,
      read: { ...threadsRef.current.read, [matchId]: now },
    };
    setThreads(threadsRef.current);
    persistThreads(true);
    // Bezy delivers only real messages between the two matched Pi accounts — there is
    // no scripted or automated reply on the other side.
  }

  function unmatch(matchId: string) {
    const match = matchesRef.current.find((m) => m.id === matchId);
    if (!match) return;
    const seed = seedMap.get(match.profileId);
    const msgs = threadsRef.current.byMatch[matchId] ?? [];

    // Retain a limited safety record (explained to the user at unmatch time).
    if (msgs.length > 0) {
      const record: SafetyRecord = {
        id: makeId("sf"),
        profileId: match.profileId,
        profileName: seed?.name ?? "Someone",
        reason: "unmatch",
        messageCount: msgs.length,
        lastMessages: msgs.slice(-4).map((m) => `${m.from === "me" ? "You" : seed?.name ?? "They"}: ${m.text}`),
        at: Date.now(),
      };
      const nextSafety = [record, ...safetyRef.current].slice(0, 40);
      safetyRef.current = nextSafety;
      setSafety(nextSafety);
      persistSafety();
    }

    const nextMatches = matchesRef.current.filter((m) => m.id !== matchId);
    matchesRef.current = nextMatches;
    setMatches(nextMatches);
    persistMatches();

    const nextByMatch = { ...threadsRef.current.byMatch };
    delete nextByMatch[matchId];
    const nextRead = { ...threadsRef.current.read };
    delete nextRead[matchId];
    const nextThreads: ThreadsState = {
      byMatch: nextByMatch,
      read: nextRead,
      greeted: threadsRef.current.greeted.filter((g) => g !== matchId),
    };
    threadsRef.current = nextThreads;
    setThreads(nextThreads);
    persistThreads(true);

    toast("Unmatched. The conversation was closed for both of you.");
  }

  function blockProfile(id: string, name: string) {
    if (!blockedRef.current.includes(id)) {
      const next = [...blockedRef.current, id];
      blockedRef.current = next;
      setBlocked(next);
      persistBlocked();
    }
    // Blocking also ends any match/conversation.
    const match = matchesRef.current.find((m) => m.profileId === id);
    if (match) {
      const nextMatches = matchesRef.current.filter((m) => m.id !== match.id);
      matchesRef.current = nextMatches;
      setMatches(nextMatches);
      persistMatches();
      const nextByMatch = { ...threadsRef.current.byMatch };
      delete nextByMatch[match.id];
      const nextThreads: ThreadsState = {
        ...threadsRef.current,
        byMatch: nextByMatch,
      };
      threadsRef.current = nextThreads;
      setThreads(nextThreads);
      persistThreads(true);
    }
    toast(`${name} was blocked`, "danger");
  }

  function reportProfile(id: string, name: string, reason: ReportReason, note: string) {
    const report: Report = {
      id: makeId("rp"),
      profileId: id,
      profileName: name,
      reason,
      note: note.trim().slice(0, 300),
      status: "open",
      action: null,
      createdAt: Date.now(),
      resolvedAt: null,
    };
    const next = [report, ...reportsRef.current].slice(0, 60);
    reportsRef.current = next;
    setReports(next);
    persistReports();
    // Reporting immediately hides them from the reporter (match/thread ended too).
    const match = matchesRef.current.find((m) => m.profileId === id);
    if (match) {
      const nextMatches = matchesRef.current.filter((m) => m.id !== match.id);
      matchesRef.current = nextMatches;
      setMatches(nextMatches);
      persistMatches();
      const nextByMatch = { ...threadsRef.current.byMatch };
      delete nextByMatch[match.id];
      threadsRef.current = { ...threadsRef.current, byMatch: nextByMatch };
      setThreads(threadsRef.current);
      persistThreads(true);
    }
    toast("Report sent. They're now hidden from you.", "rose");
  }

  function moderate(reportId: string, action: ModAction) {
    const report = reportsRef.current.find((r) => r.id === reportId);
    if (!report) return;
    const nextReports = reportsRef.current.map((r) =>
      r.id === reportId ? { ...r, status: "resolved" as const, action, resolvedAt: Date.now() } : r,
    );
    reportsRef.current = nextReports;
    setReports(nextReports);
    persistReports();

    const log: ModActionLog = {
      id: makeId("ml"),
      reportId,
      profileName: report.profileName,
      action,
      at: Date.now(),
    };
    const nextLog = [log, ...modLogRef.current].slice(0, 80);
    modLogRef.current = nextLog;
    setModLog(nextLog);
    persistModLog();
    toast("Moderation action logged", "rose");
  }

  async function deleteAccount() {
    try {
      const keys = await pi.userState.keys();
      const mine = keys.filter((k) => k.startsWith("bezy."));
      await Promise.all(mine.map((k) => pi.userState.delete(k).catch(() => {})));
    } catch {
      // Best effort; still reset local state.
    }
    setConsent(emptyConsent());
    setProfile(null);
    setPrefs(defaultPrefs());
    setLikes([]);
    setPasses([]);
    setMatches([]);
    setThreads({ byMatch: {}, read: {}, greeted: [] });
    setReports([]);
    setBlocked([]);
    setModLog([]);
    setSafety([]);
    setPremium(emptyPremium());
    consentRef.current = emptyConsent();
    profileRef.current = null;
    prefsRef.current = defaultPrefs();
    likesRef.current = [];
    passesRef.current = [];
    matchesRef.current = [];
    threadsRef.current = { byMatch: {}, read: {}, greeted: [] };
    reportsRef.current = [];
    blockedRef.current = [];
    modLogRef.current = [];
    safetyRef.current = [];
    premiumRef.current = emptyPremium();
  }

  // ---- unread ----
  function unreadFor(matchId: string): boolean {
    const msgs = threads.byMatch[matchId] ?? [];
    if (!msgs.length) return false;
    const lastTheir = [...msgs].reverse().find((m) => m.from === "them");
    if (!lastTheir) return false;
    return (threads.read[matchId] ?? 0) < lastTheir.at;
  }
  const unreadCount = useMemo(
    () => matches.filter((m) => unreadFor(m.id)).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [matches, threads],
  );

  const value: BezyContextValue = {
    ready,
    storageTrouble,
    consent,
    profile,
    prefs,
    matches,
    threads,
    reports,
    blocked,
    modLog,
    safety,
    premium,
    isPremiumActive: computeIsPremiumActive(premium, now),
    activatePremium,
    discovery,
    getSeed: (id) => seedMap.get(id),
    completeOnboarding,
    saveProfile,
    savePrefs,
    likeProfile,
    passProfile,
    getMatch,
    matchForProfile,
    messagesFor,
    unreadCount,
    unreadFor,
    markMomentSeen,
    acknowledgeGuard,
    isGuardAcknowledged,
    markRead,
    sendMessage,
    unmatch,
    blockProfile,
    reportProfile,
    moderate,
    deleteAccount,
    toasts,
    toast,
  };

  return <BezyContext.Provider value={value}>{children}</BezyContext.Provider>;
}
