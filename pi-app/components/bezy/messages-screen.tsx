"use client";

import { useBezy } from "@/contexts/bezy-context";
import { useNav } from "@/components/bezy/nav";
import { Avatar, EmptyState } from "@/components/bezy/pieces";
import { IconMail, cx } from "@/components/bezy/ui";
import { relativeTime } from "@/lib/bezy/data";

/**
 * Conversations, listed the way the Telegram mini app's Messages tab lists them: newest
 * first, one row per match, with the unread dot. Matches keeps the new-match grid.
 */
export function MessagesScreen() {
  const { matches, getSeed, messagesFor, unreadFor } = useBezy();
  const { openThread } = useNav();

  const conversations = matches
    .filter((m) => (messagesFor(m.id) ?? []).length > 0)
    .sort((a, b) => {
      const la = messagesFor(a.id);
      const lb = messagesFor(b.id);
      return (lb[lb.length - 1]?.at ?? b.createdAt) - (la[la.length - 1]?.at ?? a.createdAt);
    });

  return (
    <div className="flex min-h-full flex-col">
      <header className="px-5 pb-3 pt-1">
        <h1 className="font-display text-2xl font-bold text-bz-ink">Messages</h1>
        <p className="text-sm text-bz-muted">
          {conversations.length === 0
            ? "Your conversations live here."
            : `${conversations.length} ${conversations.length === 1 ? "conversation" : "conversations"}`}
        </p>
      </header>

      {conversations.length === 0 ? (
        <EmptyState icon={<IconMail className="h-7 w-7" />} title="No messages yet">
          When you match with someone, start the conversation — it will appear here.
        </EmptyState>
      ) : (
        <div className="flex-1 px-5 pb-6">
          <div className="divide-y divide-bz-line">
            {conversations.map((m) => {
              const seed = getSeed(m.profileId);
              if (!seed) return null;
              const msgs = messagesFor(m.id);
              const last = msgs[msgs.length - 1];
              const unread = unreadFor(m.id);
              return (
                <button
                  key={m.id}
                  onClick={() => openThread(m.id)}
                  className="bz-press flex w-full items-center gap-3 py-3.5 text-left"
                >
                  <Avatar name={seed.name} hueA={seed.hueA} hueB={seed.hueB} size={48} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <b className="truncate text-sm text-bz-ink">{seed.name}</b>
                      <span className="shrink-0 text-[10px] text-bz-muted">
                        {last ? relativeTime(last.at) : ""}
                      </span>
                    </div>
                    <p
                      className={cx(
                        "mt-1 truncate text-xs",
                        unread ? "font-semibold text-bz-ink" : "text-bz-muted",
                      )}
                    >
                      {last ? (last.from === "me" ? "You: " : "") + last.text : "Say hello"}
                    </p>
                  </div>
                  {unread ? <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-bz-rose" /> : null}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
