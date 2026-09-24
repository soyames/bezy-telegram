"use client";

import { useState } from "react";
import { useBezy } from "@/contexts/bezy-context";
import { useNav } from "@/components/bezy/nav";
import { Avatar, EmptyState, Overlay, OverlayHeader } from "@/components/bezy/pieces";
import {
  Button,
  Eyebrow,
  IconChat,
  IconCheck,
  IconEye,
  IconGavel,
  IconShield,
  Pill,
  cx,
} from "@/components/bezy/ui";
import {
  MOD_ACTION_LABEL,
  REASON_LABEL,
  relativeTime,
  type ModAction,
} from "@/lib/bezy/data";

const ACTIONS: { id: ModAction; label: string; tone: "outline" | "danger" }[] = [
  { id: "dismiss", label: "Dismiss", tone: "outline" },
  { id: "warn", label: "Warn", tone: "outline" },
  { id: "hide", label: "Hide profile", tone: "danger" },
  { id: "suspend", label: "Suspend account", tone: "danger" },
];

export function ModerationScreen() {
  const { moderationOpen, closeModeration } = useNav();
  const { reports, modLog, safety, moderate, getSeed } = useBezy();
  const [view, setView] = useState<"queue" | "log" | "safety">("queue");

  if (!moderationOpen) return null;

  const open = reports.filter((r) => r.status === "open");
  const resolved = reports.filter((r) => r.status === "resolved");

  return (
    <Overlay onClose={closeModeration}>
      <OverlayHeader
        title="Moderation"
        onBack={closeModeration}
        right={
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-bz-plum-soft text-bz-plum">
            <IconGavel className="h-5 w-5" />
          </span>
        }
      />

      <div className="border-b border-bz-line bg-bz-panel px-3 py-2">
        <div className="flex gap-1.5">
          <Tab active={view === "queue"} onClick={() => setView("queue")}>
            Queue{open.length ? ` (${open.length})` : ""}
          </Tab>
          <Tab active={view === "log"} onClick={() => setView("log")}>
            Action log
          </Tab>
          <Tab active={view === "safety"} onClick={() => setView("safety")}>
            Safety records
          </Tab>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto bz-no-scrollbar p-5">
        {view === "queue" && (
          <>
            {open.length === 0 ? (
              <EmptyState icon={<IconShield className="h-7 w-7" />} title="Queue is clear">
                Reports from Pioneers appear here for review. Acting on a report hides a profile or suspends
                an account for everyone — reporting alone only hides someone from the reporter.
              </EmptyState>
            ) : (
              <div className="space-y-4">
                {open.map((r) => {
                  const seed = getSeed(r.profileId);
                  return (
                    <div key={r.id} className="rounded-2xl border border-bz-line bg-bz-panel p-4">
                      <div className="flex items-center gap-3">
                        <Avatar
                          name={r.profileName}
                          hueA={seed?.hueA}
                          hueB={seed?.hueB}
                          size={48}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-semibold text-bz-ink">{r.profileName}</p>
                          <p className="text-xs text-bz-faint">Reported {relativeTime(r.createdAt)}</p>
                        </div>
                        <Pill tone="danger">{REASON_LABEL[r.reason]}</Pill>
                      </div>
                      {seed ? (
                        <p className="bz-pre mt-3 rounded-xl bg-bz-panel-2 p-3 text-xs leading-relaxed text-bz-muted">
                          {seed.bio}
                        </p>
                      ) : null}
                      {r.note ? (
                        <p className="bz-pre mt-2 text-sm leading-relaxed text-bz-ink">
                          <span className="font-semibold">Reporter note: </span>
                          {r.note}
                        </p>
                      ) : null}
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        {ACTIONS.map((a) => (
                          <Button
                            key={a.id}
                            variant={a.tone}
                            className="py-2.5 text-xs"
                            onClick={() => moderate(r.id, a.id)}
                          >
                            {a.label}
                          </Button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {resolved.length > 0 ? (
              <div className="mt-6">
                <Eyebrow className="mb-2">Recently resolved</Eyebrow>
                <div className="space-y-2">
                  {resolved.slice(0, 8).map((r) => (
                    <div
                      key={r.id}
                      className="flex items-center gap-2 rounded-xl border border-bz-line bg-bz-panel px-3 py-2.5 text-sm"
                    >
                      <IconCheck className="h-4 w-4 text-bz-rose" />
                      <span className="flex-1 truncate text-bz-ink">{r.profileName}</span>
                      <Pill tone="neutral">{r.action ? MOD_ACTION_LABEL[r.action] : "Resolved"}</Pill>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </>
        )}

        {view === "log" && (
          <>
            {modLog.length === 0 ? (
              <EmptyState icon={<IconEye className="h-7 w-7" />} title="No actions yet">
                Every moderation decision is logged here with a timestamp.
              </EmptyState>
            ) : (
              <div className="space-y-2">
                {modLog.map((l) => (
                  <div
                    key={l.id}
                    className="flex items-center gap-3 rounded-2xl border border-bz-line bg-bz-panel px-4 py-3"
                  >
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-bz-plum-soft text-bz-plum">
                      <IconGavel className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-bz-ink">{l.profileName}</p>
                      <p className="text-xs text-bz-faint">{relativeTime(l.at)}</p>
                    </div>
                    <Pill tone={l.action === "hide" || l.action === "suspend" ? "danger" : "neutral"}>
                      {MOD_ACTION_LABEL[l.action]}
                    </Pill>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {view === "safety" && (
          <>
            {safety.length === 0 ? (
              <EmptyState icon={<IconChat className="h-7 w-7" />} title="No retained records">
                When a conversation is unmatched, a limited safety copy is kept here so a report or safety
                concern can still be reviewed.
              </EmptyState>
            ) : (
              <div className="space-y-3">
                {safety.map((s) => (
                  <div key={s.id} className="rounded-2xl border border-bz-line bg-bz-panel p-4">
                    <div className="flex items-center justify-between">
                      <p className="font-semibold text-bz-ink">{s.profileName}</p>
                      <span className="text-xs text-bz-faint">{relativeTime(s.at)}</span>
                    </div>
                    <p className="mt-0.5 text-xs text-bz-muted">
                      Unmatched · {s.messageCount} message{s.messageCount === 1 ? "" : "s"}
                    </p>
                    {s.lastMessages.length ? (
                      <div className="mt-2 space-y-1 rounded-xl bg-bz-panel-2 p-3">
                        {s.lastMessages.map((m, i) => (
                          <p key={i} className="bz-pre text-xs leading-relaxed text-bz-muted">
                            {m}
                          </p>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </Overlay>
  );
}

function Tab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cx(
        "bz-press flex-1 rounded-full px-3 py-2 text-xs font-semibold",
        active ? "bg-bz-plum text-white" : "bg-bz-panel-2 text-bz-muted",
      )}
    >
      {children}
    </button>
  );
}
