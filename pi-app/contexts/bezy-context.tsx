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
import { configurePhotoAccount, clearAccountPhotos } from "@/lib/bezy/photos";
import {
  blockSocial,
  fetchOwnSocialProfile,
  fetchSocialDiscovery,
  fetchSocialLikes,
  fetchSocialMatches,
  fetchSocialMessages,
  markSocialRead,
  removeAllDatingPhotos,
  removeSocialProfile,
  reportSocial,
  sendSocialDecision,
  sendSocialMessage,
  syncMediaMember,
  syncSocialProfile,
  unmatchSocial,
} from "@/lib/bezy/media";
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
  GENDERS,
  idsToBlob,
  isPremiumActive as computeIsPremiumActive,
  LOOKING_FOR,
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
  MAX_MESSAGE,
  MAX_MESSAGES_PER_THREAD,
  type ConsentState,
  type DatingPrefs,
  type DatingProfile,
  type Gender,
  type LastMessage,
  type Match,
  type MatchSummary,
  type Message,
  type ModAction,
  type ModActionLog,
  type PremiumState,
  type Report,
  type ReportReason,
  type SafetyRecord,
  type SeedProfile,
  type SharedPerson,
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
  discovery: SharedPerson[];
  discoveryLoading: boolean;
  socialTrouble: boolean;

  // premium: everyone waiting on a like-back
  likesReceived: SharedPerson[];
  likesLoading: boolean;
  refreshLikes: () => Promise<void>;

  getSeed: (id: string) => SeedProfile | undefined;
  refreshDiscovery: () => Promise<void>;
  refreshSocial: () => Promise<void>;

  // onboarding + profile
  completeOnboarding: (profile: DatingProfile, prefs: DatingPrefs) => void;
  saveProfile: (profile: DatingProfile) => void;
  savePrefs: (prefs: DatingPrefs) => void;

  // discovery actions
  likeProfile: (id: string) => Promise<{ matched: boolean; match?: Match }>;
  passProfile: (id: string) => Promise<void>;

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
  refreshThread: (matchId: string) => Promise<void>;
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

/**
 * A local stand-in id for a match's newest message: the matches list reports the last
 * message without its id, so the text, time and sender identify it well enough to merge
 * once and never twice.
 */
function serverMessageId(matchId: string, last: LastMessage): string {
  return `srv_${matchId}_${last.at}_${last.fromMe ? "me" : "them"}`;
}

/** Client ids must be 8–64 chars of [A-Za-z0-9_-]; makeId can, very rarely, come up short. */
function messageClientId(): string {
  return makeId("m").padEnd(12, "0");
}

export function BezyProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, user } = usePiAuth();

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

  // People and matches come from the shared community backend: `people` is every real
  // person this session knows about, so any id (a discover card, a match, a blocker)
  // resolves to a name and a face without another request.
  const [people, setPeople] = useState<Record<string, SharedPerson>>({});
  const [serverDiscovery, setServerDiscovery] = useState<SharedPerson[]>([]);
  const [discoveryLoading, setDiscoveryLoading] = useState(false);
  const [socialTrouble, setSocialTrouble] = useState(false);
  const [likesReceived, setLikesReceived] = useState<SharedPerson[]>([]);
  const [likesLoading, setLikesLoading] = useState(false);
  const threadSynced = useRef<Set<string>>(new Set());

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
  const peopleRef = useRef(people);
  // Whether the shared community backend can be used at all for the current account.
  const socialReadyRef = useRef(false);

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
  peopleRef.current = people;
  socialReadyRef.current = ready && consent.onboarded && !!profile;

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

  /**
   * Bezy's own database is the durable copy of a member. Pi user state is the fragile one —
   * inside App Studio it is unreachable, so a member who registered there is handed a blank
   * slate on the next open and is walked through registration again. Restore from the
   * backend instead: if it holds a profile and this device does not, that profile wins.
   */
  async function restoreFromServer(loaded: DatingProfile | null): Promise<void> {
    const server = await fetchOwnSocialProfile();
    if (!server) return;
    const current = loaded ?? profileRef.current;
    // Never clobber a usable local profile with the server's older copy.
    if (current && profileComplete(current)) return;

    const now = Date.now();
    const createdAt = current?.createdAt || now;
    const gender = GENDERS.find((g) => g.id === server.gender)?.id ?? "";
    const lookingFor = LOOKING_FOR.find((l) => l.id === server.lookingFor)?.id ?? "open";
    const profile: DatingProfile = {
      displayName: server.name || "",
      age: server.age || 0,
      gender,
      bio: server.bio || "",
      interests: Array.isArray(server.interests) ? server.interests : [],
      lookingFor,
      area: server.area || "",
      photos: current?.photos ?? [],
      photoConsent: server.photoConsent === true,
      createdAt,
      updatedAt: now,
    };
    profileRef.current = profile;
    setProfile(profile);

    const interestedIn = (server.prefs?.interestedIn ?? []).filter(
      (g): g is Gender => GENDERS.some((entry) => entry.id === g),
    );
    const prefs: DatingPrefs = {
      ...prefsRef.current,
      interestedIn: interestedIn.length ? interestedIn : prefsRef.current.interestedIn,
      ageMin: server.prefs?.ageMin ?? prefsRef.current.ageMin,
      ageMax: server.prefs?.ageMax ?? prefsRef.current.ageMax,
      widenArea: server.prefs?.widenArea ?? prefsRef.current.widenArea,
      visibility: server.visibility === "hidden" || server.visibility === "matches_only"
        ? server.visibility
        : "everyone",
      whoCanMessage: server.prefs?.whoCanMessage === "everyone" ? "everyone" : "matches",
      paused: server.paused === true,
    };
    prefsRef.current = prefs;
    setPrefs(prefs);

    // Registering them is exactly what publishing to the backend already meant.
    const consent: ConsentState = { adult: true, agreed: true, onboarded: true, at: createdAt };
    consentRef.current = consent;
    setConsent(consent);
  }

  // ---- load ----
  useEffect(() => {
    if (!isAuthenticated || !user?.uid) return;
    configurePhotoAccount(user.uid);
    let cancelled = false;
    (async () => {
      // One retry per key, then surface it. These reads are independent, and the previous
      // Promise.all threw the whole session away if any single one rejected: every key
      // reset to its default at once, the app looked freshly installed, and onboarding
      // then wrote those defaults over real data.
      const readKey = async (key: string) => {
        try {
          return await pi.userState.get(key);
        } catch {
          await new Promise((resolve) => setTimeout(resolve, 600));
          return pi.userState.get(key);
        }
      };

      try {
        const settled = await Promise.allSettled([
          KEYS.consent,
          KEYS.profile,
          KEYS.prefs,
          KEYS.decisions,
          KEYS.matches,
          KEYS.threads,
          KEYS.reports,
          KEYS.blocks,
          KEYS.modlog,
          KEYS.safety,
          KEYS.premium,
        ].map(readKey));
        if (cancelled) return;
        if (settled.some((r) => r.status === "rejected")) setStorageTrouble(true);
        const [c, p, pr, dec, m, th, rep, bl, ml, sf, pm] = settled.map((r) =>
          r.status === "fulfilled" ? r.value : null,
        );
        const localProfile = sanitizeProfile(p);
        setConsent(sanitizeConsent(c));
        setProfile(localProfile);
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
        // Bezy's database outranks local state: it is the copy that survives, so a member
        // who is already registered there is never shown registration again.
        try {
          await restoreFromServer(localProfile);
        } catch {
          // Keep whatever we loaded locally; never block the app on this.
        }
      } catch {
        // Fresh start on load error; nothing is overwritten until a save happens.
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, user?.uid]);

  // Keep the backend's photo access state aligned with the user's Pi profile.
  // Media stays inaccessible until onboarding and photo consent are complete.
  useEffect(() => {
    if (!ready || !consent.onboarded || !profile) return;
    const visible = profileComplete(profile) && profile.photoConsent
      && !prefs.paused && prefs.visibility === "everyone";
    void syncMediaMember(profile.photoConsent, visible).catch(() => {
      setStorageTrouble(true);
    });
  }, [ready, consent.onboarded, profile, prefs.paused, prefs.visibility]);

  // Publish the same profile to the shared community service — always, because even a pause
  // is a preference the server needs. Only then can discovery and matches hold real people.
  // Edits collapse into one publish the way storage writes do.
  useEffect(() => {
    if (!ready || !consent.onboarded || !profile) return;
    const timer = setTimeout(() => {
      const current = profileRef.current;
      if (!current) return;
      void (async () => {
        // Only ever visible when there is no one on screen yet: the first look for people.
        setDiscoveryLoading(true);
        try {
          await syncSocialProfile(current, prefsRef.current);
          setSocialTrouble(false);
          await Promise.all([refreshDiscovery(), refreshMatches()]);
        } catch {
          setSocialTrouble(true);
        } finally {
          setDiscoveryLoading(false);
        }
      })();
    }, 700);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, consent.onboarded, profile, prefs]);

  // While the app is open, keep matches and their newest messages fresh. Polling never
  // toasts: a failed poll only raises the retry notice on Discover.
  useEffect(() => {
    if (!isAuthenticated || !ready || !consent.onboarded) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "hidden") return;
      void refreshMatches();
    }, 10000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, ready, consent.onboarded]);

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

  // The backend decides who is genuinely available (both sides' filters, blocks, matches).
  // Everything this session has already acted on is filtered out again here, from the exact
  // same rules the local seed pool used, so a stale response can't resurface anyone.
  const discovery = useMemo<SharedPerson[]>(() => {
    if (!profile || !profileComplete(profile) || prefs.paused) return [];
    // buildDiscovery only ever filters the pool it is handed, so these stay real people.
    return buildDiscovery(
      {
        profile,
        prefs,
        likes: new Set(likes),
        passes: new Set(passes),
        matchedIds,
        blocked: new Set(blocked),
        reported: reportedIds,
      },
      serverDiscovery,
    ) as SharedPerson[];
  }, [profile, prefs, likes, passes, matchedIds, blocked, reportedIds, serverDiscovery]);

  // ---- shared community (Pi + Telegram people) ----

  function mergePeople(list: SharedPerson[]) {
    if (!list.length) return;
    setPeople((prev) => {
      const next = { ...prev };
      for (const person of list) next[person.id] = person;
      return next;
    });
  }

  /**
   * Everyone who already liked this account and is still waiting on a decision. Loaded for
   * every member, not just Premium: the count is what the Matches screen teases, and only
   * the identities behind it are Premium.
   */
  async function refreshLikes(): Promise<void> {
    if (!socialReadyRef.current) return;
    setLikesLoading(true);
    try {
      const list = await fetchSocialLikes();
      setLikesReceived(list);
      mergePeople(list);
    } catch {
      // Keep the last known count; the open screen offers its own retry.
    } finally {
      setLikesLoading(false);
    }
  }

  async function refreshDiscovery(): Promise<void> {
    if (!socialReadyRef.current) return;
    setDiscoveryLoading(true);
    try {
      const list = await fetchSocialDiscovery();
      setServerDiscovery(list);
      mergePeople(list);
      setSocialTrouble(false);
    } catch {
      // Keep whoever we already have; the Discover notice offers a retry.
      setSocialTrouble(true);
    } finally {
      setDiscoveryLoading(false);
    }
  }

  /** Matches the server knows about that this device hasn't stored yet. */
  function applyServerMatches(list: MatchSummary[]) {
    const counterparts = list
      .map((item) => item.counterpart)
      .filter((person): person is SharedPerson => person !== null);
    mergePeople(counterparts);

    const known = new Set(matchesRef.current.map((m) => m.id));
    const added: Match[] = [];
    for (const item of list) {
      const person = item.counterpart;
      if (!person || known.has(item.id)) continue;
      known.add(item.id);
      added.push({
        id: item.id,
        profileId: person.id,
        createdAt: item.createdAt,
        // Found on a later poll, so it didn't happen on screen: no match moment.
        seenMoment: true,
      });
    }
    if (added.length) {
      const next = [...matchesRef.current, ...added];
      matchesRef.current = next;
      setMatches(next);
      persistMatches();
    }
    mergeLastMessages(list);
  }

  /**
   * The matches list reports each conversation's newest message without an id. Merging it
   * keeps the list (and its unread dot) honest when the message was sent from another
   * device, and never reorders what this device already shows.
   */
  function mergeLastMessages(list: MatchSummary[]) {
    let changed = false;
    for (const item of list) {
      const last = item.lastMessage;
      if (!last || !last.text) continue;
      const current = threadsRef.current.byMatch[item.id] ?? [];
      if (current.some((m) => m.id === serverMessageId(item.id, last))) continue;
      const lastAt = current.length ? current[current.length - 1].at : 0;
      if (last.at <= lastAt) continue;
      const next = [...current, {
        id: serverMessageId(item.id, last),
        from: last.fromMe ? "me" as const : "them" as const,
        text: last.text,
        at: last.at,
      }].slice(-MAX_MESSAGES_PER_THREAD);
      threadsRef.current = {
        ...threadsRef.current,
        byMatch: { ...threadsRef.current.byMatch, [item.id]: next },
      };
      changed = true;
    }
    if (changed) {
      setThreads(threadsRef.current);
      persistThreads();
    }
  }

  async function refreshMatches(): Promise<void> {
    if (!socialReadyRef.current) return;
    try {
      const list = await fetchSocialMatches();
      setSocialTrouble(false);
      applyServerMatches(list);
    } catch {
      // Polling is silent; a match the server can't confirm yet stays local.
      setSocialTrouble(true);
    }
  }

  async function refreshSocial(): Promise<void> {
    await Promise.all([refreshDiscovery(), refreshMatches(), refreshLikes()]);
  }

  async function refreshThread(matchId: string): Promise<void> {
    if (!socialReadyRef.current) return;
    const current = threadsRef.current.byMatch[matchId] ?? [];
    const lastAt = current.length ? current[current.length - 1].at : 0;
    // The first look at a conversation brings its recent history; after that, only the tail.
    const after = threadSynced.current.has(matchId) ? lastAt : 0;
    try {
      const incoming = await fetchSocialMessages(matchId, after);
      threadSynced.current.add(matchId);
      if (!incoming.length) return;
      mergeServerMessages(matchId, incoming);
      if (incoming.some((m) => m.from === "them")) markRead(matchId);
    } catch {
      // Silent: a conversation that can't refresh keeps the messages already shown.
    }
  }

  function mergeServerMessages(matchId: string, incoming: Message[]) {
    const current = threadsRef.current.byMatch[matchId] ?? [];
    const byId = new Map(current.map((m) => [m.id, m]));
    let added = 0;
    for (const message of incoming) {
      if (byId.has(message.id)) continue;
      byId.set(message.id, message);
      added += 1;
    }
    if (!added) return;
    const merged = [...byId.values()]
      .sort((a, b) => a.at - b.at)
      .slice(-MAX_MESSAGES_PER_THREAD);
    threadsRef.current = {
      ...threadsRef.current,
      byMatch: { ...threadsRef.current.byMatch, [matchId]: merged },
    };
    setThreads(threadsRef.current);
    persistThreads();
  }

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

  async function likeProfile(id: string): Promise<{ matched: boolean; match?: Match }> {
    if (!likesRef.current.includes(id)) {
      const nextLikes = [...likesRef.current, id];
      likesRef.current = nextLikes;
      setLikes(nextLikes);
      persistDecisions();
    }
    // The shared backend knows whether the other person liked back; a match is only ever
    // created from its answer, never inferred from what this device has seen.
    try {
      const { matched, match } = await sendSocialDecision(id, "like");
      const person = match?.counterpart ?? null;
      if (!matched || !match || !person) return { matched: false };
      mergePeople([person]);
      let local = matchesRef.current.find((m) => m.id === match.id);
      if (!local) {
        local = {
          id: match.id,
          profileId: person.id,
          createdAt: match.createdAt,
          seenMoment: false,
        };
        const next = [...matchesRef.current, local];
        matchesRef.current = next;
        setMatches(next);
        persistMatches();
      }
      return { matched: true, match: local };
    } catch {
      // They left discovery (404) or the service is unreachable: not a match, and the
      // local "like" still hides them here until the server says otherwise.
      return { matched: false };
    }
  }

  async function passProfile(id: string): Promise<void> {
    if (!passesRef.current.includes(id)) {
      const next = [...passesRef.current, id];
      passesRef.current = next;
      setPasses(next);
      persistDecisions();
    }
    try {
      await sendSocialDecision(id, "pass");
    } catch {
      // A decision the backend never recorded is invisible here either way: passes are
      // local too, so the same person can't come back and surprise the user.
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
    // Tell the shared backend too, so the other person's "sent" turns into "read" there.
    void markSocialRead(matchId).catch(() => {});
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
    const clean = text.trim().slice(0, MAX_MESSAGE);
    if (!clean) return;
    const match = matchesRef.current.find((m) => m.id === matchId);
    if (!match) return;
    const now = Date.now();
    const clientId = messageClientId();
    appendMessage(matchId, { id: clientId, from: "me", text: clean, at: now });
    // Mark my own message as read.
    threadsRef.current = {
      ...threadsRef.current,
      read: { ...threadsRef.current.read, [matchId]: now },
    };
    setThreads(threadsRef.current);
    persistThreads(true);
    // The message shows straight away and is delivered in the background with the same id,
    // so the copy the server stores is the copy already on screen. A send that fails is
    // kept locally (it can still be read back) and the user is told it didn't go out.
    void sendSocialMessage(matchId, clientId, clean).catch(() => {
      setSocialTrouble(true);
      toast("Message not sent", "danger");
    });
  }

  function unmatch(matchId: string) {
    const match = matchesRef.current.find((m) => m.id === matchId);
    if (!match) return;
    const seed = peopleRef.current[match.profileId] ?? seedMap.get(match.profileId);
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

    // Close it on the backend as well, so it disappears for them too.
    void unmatchSocial(matchId).catch(() => {});
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
    // Only people the shared backend knows about can be blocked there; a real block hides
    // each of you from the other's discovery, not just this device.
    if (peopleRef.current[id]) void blockSocial(id).catch(() => {});
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
    // The backend keeps the report (and blocks them both ways) so moderation can act on
    // someone who is messaging people beyond this device.
    if (peopleRef.current[id]) {
      void reportSocial(id, reason, note).catch(() => {});
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
    // Remove the shared profile first: it takes the account out of discovery and closes
    // every conversation on the backend before anything local disappears.
    await removeSocialProfile();
    await removeAllDatingPhotos();
    await clearAccountPhotos();
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
    setPeople({});
    setServerDiscovery([]);
    setSocialTrouble(false);
    threadSynced.current.clear();
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
    peopleRef.current = {};
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
    discoveryLoading,
    socialTrouble,
    likesReceived,
    likesLoading,
    refreshLikes,
    // Real people first; the (empty) local seed pool stays as the last resort.
    getSeed: (id) => people[id] ?? seedMap.get(id),
    refreshDiscovery,
    refreshSocial,
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
    refreshThread,
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
