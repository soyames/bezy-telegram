"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useBezy } from "@/contexts/bezy-context";
import { useNav } from "@/components/bezy/nav";
import { Avatar, ConfirmButton, Overlay, Sheet } from "@/components/bezy/pieces";
import {
  Button,
  IconBan,
  IconClose,
  IconFlag,
  IconHeartFilled,
  IconSend,
  IconSettings,
  IconShield,
  cx,
} from "@/components/bezy/ui";
import { dayLabel, relativeTime } from "@/lib/bezy/data";

export function ThreadView() {
  const { threadId, closeThread, openReport } = useNav();
  const {
    getMatch,
    getSeed,
    messagesFor,
    sendMessage,
    markRead,
    refreshThread,
    unmatch,
    blockProfile,
    isGuardAcknowledged,
    acknowledgeGuard,
  } = useBezy();

  const match = threadId ? getMatch(threadId) : undefined;
  const seed = match ? getSeed(match.profileId) : undefined;
  const messages = threadId ? messagesFor(threadId) : [];
  const [text, setText] = useState("");
  const [menu, setMenu] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const acknowledged = threadId ? isGuardAcknowledged(threadId) : false;
  const showGuard = messages.length === 0 && !acknowledged;

  useEffect(() => {
    if (threadId) markRead(threadId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId, messages.length]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  // Keep the open conversation current: their replies arrive while it is on screen.
  useEffect(() => {
    if (!threadId) return;
    void refreshThread(threadId);
    const timer = setInterval(() => {
      if (document.visibilityState === "hidden") return;
      void refreshThread(threadId);
    }, 5000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId]);

  // Match may vanish (unmatch/block) — close the overlay.
  useEffect(() => {
    if (threadId && !match) closeThread();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match, threadId]);

  if (!threadId || !match || !seed) return null;

  function submit() {
    const clean = text.trim();
    if (!clean || !threadId) return;
    sendMessage(threadId, clean);
    setText("");
  }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229) {
      e.preventDefault();
      submit();
    }
  }

  let lastDay = "";

  return (
    <Overlay onClose={closeThread}>
      <header className="bz-safe-top sticky top-0 z-10 flex items-center gap-2 border-b border-bz-line bg-bz-panel/95 px-3 py-2.5 backdrop-blur">
        <button
          onClick={closeThread}
          aria-label="Back"
          className="bz-press flex h-9 w-9 items-center justify-center rounded-full text-bz-ink"
        >
          <IconClose className="h-5 w-5" />
        </button>
        <Avatar name={seed.name} hueA={seed.hueA} hueB={seed.hueB} size={40} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-base font-semibold text-bz-ink">{seed.name}</p>
          <p className="truncate text-xs text-bz-muted">Matched {relativeTime(match.createdAt)}</p>
        </div>
        <button
          onClick={() => setMenu(true)}
          aria-label="Conversation options"
          className="bz-press flex h-9 w-9 items-center justify-center rounded-full text-bz-muted"
        >
          <IconSettings className="h-5 w-5" />
        </button>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto bz-no-scrollbar px-4 py-4">
        <div className="mx-auto mb-5 max-w-xs rounded-2xl bg-bz-panel-2 p-4 text-center">
          <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bz-rose-grad text-bz-on-rose">
            <IconHeartFilled className="h-5 w-5" />
          </div>
          <p className="font-display text-sm font-semibold text-bz-ink">
            You matched with {seed.name}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-bz-muted">
            Messages are private to the two of you. Be kind and respectful.
          </p>
        </div>

        {messages.map((m) => {
          const day = dayLabel(m.at);
          const showDay = day !== lastDay;
          lastDay = day;
          return (
            <div key={m.id}>
              {showDay ? (
                <p className="my-3 text-center text-[0.7rem] font-medium text-bz-faint">{day}</p>
              ) : null}
              <div className={cx("mb-2 flex", m.from === "me" ? "justify-end" : "justify-start")}>
                <div
                  className={cx(
                    "max-w-[78%] rounded-3xl px-4 py-2.5 text-sm leading-relaxed",
                    m.from === "me"
                      ? "bz-rose-grad text-bz-on-rose rounded-br-lg"
                      : "border border-bz-line bg-bz-panel text-bz-ink rounded-bl-lg",
                  )}
                >
                  <span className="bz-pre">{m.text}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {showGuard ? (
        <div className="bz-safe-bottom border-t border-bz-line bg-bz-panel p-4">
          <div className="flex items-start gap-3 rounded-2xl bg-bz-peach-soft p-3.5">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/70 text-bz-rose">
              <IconShield className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-semibold text-bz-ink">Before your first message</p>
              <p className="mt-0.5 text-xs leading-relaxed text-bz-muted">
                Lead with warmth and respect. Ask a genuine question, avoid anything explicit, and remember
                there&apos;s a real person on the other side.
              </p>
            </div>
          </div>
          <Button
            className="mt-3"
            block
            onClick={() => threadId && acknowledgeGuard(threadId)}
          >
            Got it — start the conversation
          </Button>
        </div>
      ) : (
        <div className="bz-safe-bottom border-t border-bz-line bg-bz-panel p-3">
          <div className="flex items-end gap-2">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={onKey}
              rows={1}
              maxLength={1000}
              placeholder={`Message ${seed.name}…`}
              className="max-h-32 min-h-[2.75rem] flex-1 resize-none rounded-3xl border border-bz-line bg-bz-panel-2 px-4 py-3 text-sm text-bz-ink outline-none placeholder:text-bz-faint focus:border-bz-rose"
            />
            <button
              onClick={submit}
              disabled={!text.trim()}
              aria-label="Send"
              className="bz-press flex h-11 w-11 shrink-0 items-center justify-center rounded-full bz-rose-grad text-bz-on-rose disabled:opacity-40"
            >
              <IconSend className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}

      {menu ? (
        <Sheet onClose={() => setMenu(false)}>
          <h3 className="font-display text-lg font-semibold text-bz-ink">{seed.name}</h3>
          <p className="mt-1 text-xs leading-relaxed text-bz-muted">
            Unmatching ends this conversation for both of you — the thread disappears from both lists and no
            one can send new messages. A limited safety copy is kept for moderation so a report can still be
            handled if needed.
          </p>
          <div className="mt-4 space-y-2">
            <button
              onClick={() => {
                setMenu(false);
                openReport({ id: seed.id, name: seed.name });
              }}
              className="bz-press flex w-full items-center gap-3 rounded-2xl border border-bz-line bg-bz-panel px-4 py-3 text-sm font-semibold text-bz-ink"
            >
              <IconFlag className="h-5 w-5 text-bz-muted" />
              Report {seed.name}
            </button>
            <button
              onClick={() => {
                blockProfile(seed.id, seed.name);
                setMenu(false);
                closeThread();
              }}
              className="bz-press flex w-full items-center gap-3 rounded-2xl border border-bz-line bg-bz-panel px-4 py-3 text-sm font-semibold text-bz-ink"
            >
              <IconBan className="h-5 w-5 text-bz-muted" />
              Block {seed.name}
            </button>
            <ConfirmButton
              label="Unmatch"
              confirmLabel="Tap again to unmatch"
              onConfirm={() => {
                if (threadId) unmatch(threadId);
                setMenu(false);
                closeThread();
              }}
            />
          </div>
        </Sheet>
      ) : null}
    </Overlay>
  );
}
