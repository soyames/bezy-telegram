"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

export type Tab = "discover" | "matches" | "profile";

export interface ReportTarget {
  id: string;
  name: string;
}

interface NavValue {
  tab: Tab;
  setTab: (t: Tab) => void;
  threadId: string | null;
  openThread: (id: string) => void;
  closeThread: () => void;
  candidateId: string | null;
  openCandidate: (id: string) => void;
  closeCandidate: () => void;
  reportTarget: ReportTarget | null;
  openReport: (t: ReportTarget) => void;
  closeReport: () => void;
  settingsOpen: boolean;
  openSettings: () => void;
  closeSettings: () => void;
  moderationOpen: boolean;
  openModeration: () => void;
  closeModeration: () => void;
  editOpen: boolean;
  openEdit: () => void;
  closeEdit: () => void;
  premiumOpen: boolean;
  openPremium: () => void;
  closePremium: () => void;
}

const NavContext = createContext<NavValue | null>(null);

export function useNav(): NavValue {
  const ctx = useContext(NavContext);
  if (!ctx) throw new Error("useNav must be used within NavProvider");
  return ctx;
}

export function NavProvider({ children }: { children: ReactNode }) {
  const [tab, setTab] = useState<Tab>("discover");
  const [threadId, setThreadId] = useState<string | null>(null);
  const [candidateId, setCandidateId] = useState<string | null>(null);
  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [moderationOpen, setModerationOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [premiumOpen, setPremiumOpen] = useState(false);

  const value: NavValue = {
    tab,
    setTab,
    threadId,
    openThread: (id) => setThreadId(id),
    closeThread: () => setThreadId(null),
    candidateId,
    openCandidate: (id) => setCandidateId(id),
    closeCandidate: () => setCandidateId(null),
    reportTarget,
    openReport: (t) => setReportTarget(t),
    closeReport: () => setReportTarget(null),
    settingsOpen,
    openSettings: () => setSettingsOpen(true),
    closeSettings: () => setSettingsOpen(false),
    moderationOpen,
    openModeration: () => setModerationOpen(true),
    closeModeration: () => setModerationOpen(false),
    editOpen,
    openEdit: () => setEditOpen(true),
    closeEdit: () => setEditOpen(false),
    premiumOpen,
    openPremium: () => setPremiumOpen(true),
    closePremium: () => setPremiumOpen(false),
  };

  return <NavContext.Provider value={value}>{children}</NavContext.Provider>;
}
