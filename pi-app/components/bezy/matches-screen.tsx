"use client";

import { useBezy } from "@/contexts/bezy-context";
import { useNav } from "@/components/bezy/nav";
import { Avatar, EmptyState, UpsellCard } from "@/components/bezy/pieces";
import { IconChat, IconHeartFilled, IconLock } from "@/components/bezy/ui";

/**
 * New matches only. Conversations moved to their own Messages tab, matching the Telegram
 * mini app, so this screen stays the grid of people you have just matched with.
 */
export function MatchesScreen() {
  const { matches, getSeed, messagesFor, likesReceived, isPremiumActive } = useBezy();
  const { openThread, openLikes } = useNav();

  const newMatches = matches.filter((m) => (messagesFor(m.id) ?? []).length === 0);

  return (
    <div className="flex min-h-full flex-col">
      <header className="px-5 pb-3 pt-1">
        <h1 className="font-display text-2xl font-bold text-bz-ink">Matches</h1>
        <p className="text-sm text-bz-muted">
          {matches.length === 0
            ? "Mutual likes will appear here."
            : `${matches.length} mutual ${matches.length === 1 ? "match" : "matches"}`}
        </p>
      </header>

      {/* Always visible, even with no matches — the point is that someone is already
          waiting, and that is exactly when a member has nothing else on this screen. */}
      <div className="mx-5 mb-4">
        <UpsellCard
          icon={
            isPremiumActive ? (
              <IconHeartFilled className="h-5 w-5" />
            ) : (
              <IconLock className="h-5 w-5" />
            )
          }
          title={
            likesReceived.length > 0
              ? `${likesReceived.length} ${likesReceived.length === 1 ? "person likes" : "people like"} you`
              : "Likes you"
          }
          desc={
            isPremiumActive
              ? "See everyone waiting on your decision."
              : "Premium shows you who they are."
          }
          onClick={openLikes}
        />
      </div>

      {matches.length === 0 ? (
        <EmptyState icon={<IconHeartFilled className="h-7 w-7" />} title="No matches yet">
          When you and someone like each other, you&apos;ll match here and can start a conversation. Head to
          Discover to find people who fit both of your preferences.
        </EmptyState>
      ) : newMatches.length === 0 ? (
        <EmptyState icon={<IconChat className="h-7 w-7" />} title="No new matches">
          Everyone you have matched with is already a conversation — find them in Messages.
        </EmptyState>
      ) : (
        <div className="flex-1 px-5 pb-6">
          <section>
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-bz-faint">
              New matches
            </p>
            <div className="flex gap-4 overflow-x-auto bz-no-scrollbar pb-1">
              {newMatches.map((m) => {
                const seed = getSeed(m.profileId);
                if (!seed) return null;
                return (
                  <button
                    key={m.id}
                    onClick={() => openThread(m.id)}
                    className="bz-press flex w-16 shrink-0 flex-col items-center gap-1.5"
                  >
                    <span className="relative">
                      <Avatar
                        name={seed.name}
                        hueA={seed.hueA}
                        hueB={seed.hueB}
                        size={64}
                        className="ring-2 ring-bz-rose"
                      />
                      <span className="absolute -bottom-0.5 -right-0.5 flex h-6 w-6 items-center justify-center rounded-full bz-rose-grad text-bz-on-rose">
                        <IconChat className="h-3.5 w-3.5" />
                      </span>
                    </span>
                    <span className="w-full truncate text-center text-xs font-medium text-bz-ink">
                      {seed.name}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
