"use client";

import { useEffect } from "react";
import { useBezy } from "@/contexts/bezy-context";
import { Avatar } from "@/components/bezy/pieces";
import { Button, IconHeartFilled } from "@/components/bezy/ui";
import type { Match } from "@/lib/bezy/data";

export function MatchMoment({
  match,
  onMessage,
  onKeepBrowsing,
}: {
  match: Match;
  onMessage: () => void;
  onKeepBrowsing: () => void;
}) {
  const { getSeed, profile, markMomentSeen } = useBezy();
  const seed = getSeed(match.profileId);

  useEffect(() => {
    markMomentSeen(match.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match.id]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  if (!seed) return null;

  return (
    <div className="fixed inset-0 z-[140] flex items-center justify-center px-6 bz-hero-grad">
      <div className="anim-pop w-full max-w-sm text-center">
        <p className="font-display text-sm font-semibold uppercase tracking-[0.3em] text-white/80">
          It&apos;s a match
        </p>
        <h2 className="mt-2 font-display text-4xl font-bold text-white">
          You &amp; {seed.name}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-white/85">
          You both liked each other. Say hi whenever you&apos;re ready — kindness first, always.
        </p>

        <div className="mt-8 flex items-center justify-center gap-4">
          <Avatar
            name={profile?.displayName || "You"}
            photo={profile?.photos[0]}
            hueA={12}
            hueB={340}
            size={96}
            className="ring-4 ring-white/50"
          />
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-bz-rose shadow-lg anim-heart">
            <IconHeartFilled className="h-6 w-6" />
          </div>
          <Avatar
            name={seed.name}
            hueA={seed.hueA}
            hueB={seed.hueB}
            size={96}
            className="ring-4 ring-white/50"
          />
        </div>

        <div className="mt-9 space-y-3">
          <Button
            variant="outline"
            block
            className="border-transparent bg-white text-bz-rose-deep"
            onClick={onMessage}
          >
            Send a message
          </Button>
          <button
            onClick={onKeepBrowsing}
            className="bz-press w-full rounded-full py-3 text-sm font-semibold text-white/90"
          >
            Keep browsing
          </button>
        </div>
      </div>
    </div>
  );
}
