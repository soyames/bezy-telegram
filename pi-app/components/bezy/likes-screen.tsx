"use client";

import { useEffect, useState } from "react";
import { useBezy } from "@/contexts/bezy-context";
import { useNav } from "@/components/bezy/nav";
import { Overlay, OverlayHeader, PersonPhoto } from "@/components/bezy/pieces";
import {
  Button,
  IconHeartFilled,
  IconLock,
  IconPin,
  IconSpark,
  IconStar,
  Pill,
  Spinner,
} from "@/components/bezy/ui";
import { usePiAuth } from "@/contexts/pi-auth-context";
import { genderLabel, lookingForLabel, sharedInterests, type SharedPerson } from "@/lib/bezy/data";

/**
 * Premium: the people who already liked you and are still waiting on a decision. The count
 * is public — the Matches screen teases it — but only Premium sees who is behind it.
 * Liking back here matches immediately, because the other like already exists.
 */
export function LikesScreen() {
  const { likesOpen, closeLikes, openCandidate, openPremium } = useNav();
  const {
    profile,
    isPremiumActive,
    likesReceived,
    likesLoading,
    refreshLikes,
    likeProfile,
    toast,
    socialTrouble,
  } = useBezy();
  const { isAuthenticated } = usePiAuth();
  const [acting, setActing] = useState<string | null>(null);

  // Opening the screen is the refresh trigger, so the list is never stale on arrival.
  useEffect(() => {
    if (likesOpen) void refreshLikes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [likesOpen]);

  if (!likesOpen) return null;

  async function likeBack(person: SharedPerson) {
    setActing(person.id);
    try {
      const result = await likeProfile(person.id);
      toast(
        result.matched ? `It's a match with ${person.name}!` : `Liked ${person.name} back.`,
        "rose",
      );
      // The backend now excludes them, so the list re-reads itself rather than guessing.
      await refreshLikes();
    } catch {
      toast("Couldn't send that like. Try again.", "rose");
    } finally {
      setActing(null);
    }
  }

  function renderBody() {
    if (!isAuthenticated) {
      return (
        <Centred>
          <p className="text-sm text-bz-muted">Open Bezy inside Pi Browser to see this.</p>
        </Centred>
      );
    }
    if (!isPremiumActive) {
      return (
        <div className="px-5 pt-4">
          <div className="bz-premium-grad relative overflow-hidden rounded-3xl p-5 text-white">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/20">
              <IconLock className="h-5 w-5" />
            </span>
            <h2 className="mt-3 font-display text-2xl font-bold">Premium shows you who</h2>
            <p className="mt-1 text-sm text-white/90">
              They already liked you. Upgrade once and see everyone waiting, then match by liking
              back.
            </p>
            <Button
              className="mt-4"
              block
              onClick={() => {
                closeLikes();
                openPremium();
              }}
            >
              <IconStar className="h-4 w-4" />
              See who liked you
            </Button>
          </div>
        </div>
      );
    }
    if (likesLoading && likesReceived.length === 0) {
      return (
        <Centred>
          <Spinner className="h-6 w-6 text-bz-rose" />
          <p className="text-sm text-bz-muted">Looking for people who liked you…</p>
        </Centred>
      );
    }
    if (likesReceived.length === 0) {
      return (
        <Centred>
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-bz-rose-soft text-bz-rose">
            <IconHeartFilled className="h-7 w-7" />
          </span>
          <h2 className="font-display text-xl font-semibold text-bz-ink">No likes waiting</h2>
          <p className="max-w-xs text-sm leading-relaxed text-bz-muted">
            {socialTrouble
              ? "Couldn't reach Bezy's community service just now."
              : "When someone likes you, they'll wait for you here so you can decide in your own time."}
          </p>
          {socialTrouble ? (
            <Button className="mt-2" disabled={likesLoading} onClick={() => void refreshLikes()}>
              Try again
            </Button>
          ) : null}
        </Centred>
      );
    }

    const mine = profile?.interests ?? [];
    return (
      <div className="divide-y divide-bz-line-soft px-5">
        {likesReceived.map((person) => {
          const shared = sharedInterests(mine, person.interests);
          return (
            <div key={person.id} className="flex items-center gap-3 py-3">
              <button
                onClick={() => {
                  closeLikes();
                  openCandidate(person.id);
                }}
                className="bz-press flex min-w-0 flex-1 items-center gap-3 text-left"
              >
                <PersonPhoto
                  ownerId={person.id}
                  photoId={person.photoIds[0]}
                  name={person.name}
                  hueA={person.hueA}
                  hueB={person.hueB}
                  rounded="rounded-full"
                  className="h-14 w-14 shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-semibold text-bz-ink">
                      {person.name}{" "}
                      <span className="font-normal text-bz-muted">{person.age}</span>
                    </span>
                  </div>
                  <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-bz-muted">
                    <IconPin className="h-3.5 w-3.5 shrink-0" />
                    {person.area}
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    <Pill tone="rose">{lookingForLabel(person.lookingFor)}</Pill>
                    <Pill tone="plum">{genderLabel(person.gender)}</Pill>
                    {shared > 0 ? (
                      <Pill tone="peach">
                        <IconSpark className="h-3.5 w-3.5" />
                        {shared} in common
                      </Pill>
                    ) : null}
                  </div>
                </div>
              </button>
              <button
                onClick={() => void likeBack(person)}
                disabled={acting !== null}
                aria-label={`Like ${person.name} back`}
                className="bz-press flex h-11 w-11 shrink-0 items-center justify-center rounded-full bz-rose-grad text-bz-on-rose disabled:opacity-50"
              >
                {acting === person.id ? (
                  <Spinner className="h-5 w-5" />
                ) : (
                  <IconHeartFilled className="h-5 w-5" />
                )}
              </button>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <Overlay onClose={closeLikes}>
      <OverlayHeader title="Likes you" onBack={closeLikes} />
      <div className="flex-1 overflow-y-auto bz-no-scrollbar">{renderBody()}</div>
    </Overlay>
  );
}

function Centred({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-8 py-16 text-center">
      {children}
    </div>
  );
}
