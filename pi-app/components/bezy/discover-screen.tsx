"use client";

import { useBezy } from "@/contexts/bezy-context";
import { BezyMark, Button, IconHeartFilled, IconPin, Pill } from "@/components/bezy/ui";

export function DiscoverScreen() {
  const { profile, prefs, savePrefs, toast } = useBezy();

  return (
    <div className="flex min-h-full flex-col">
      <header className="bz-safe-top flex items-center justify-between px-5 pb-2 pt-4">
        <span className="inline-flex items-center gap-2.5" aria-label="Bezy">
          <BezyMark className="h-9 w-9 rounded-lg" />
          <span className="font-display text-xl font-bold tracking-tight text-bz-ink">Bezy</span>
        </span>
        <Pill tone="rose">
          <IconPin className="h-3.5 w-3.5" />
          {prefs.widenArea ? "Wider area" : profile?.area}
        </Pill>
      </header>

      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-bz-rose-soft text-bz-rose">
          <IconHeartFilled className="h-8 w-8" />
        </div>
        {prefs.paused ? (
          <>
            <h2 className="font-display text-xl font-semibold text-bz-ink">Discovery is paused</h2>
            <p className="max-w-xs text-sm leading-relaxed text-bz-muted">
              You&apos;re hidden and not shown to anyone right now. Resume whenever you&apos;re ready.
            </p>
            <Button
              className="mt-2"
              onClick={() => {
                savePrefs({ ...prefs, paused: false });
                toast("Discovery resumed.", "rose");
              }}
            >
              Resume discovery
            </Button>
          </>
        ) : (
          <>
            <h2 className="font-display text-xl font-semibold text-bz-ink">No one to show yet</h2>
            <p className="max-w-xs text-sm leading-relaxed text-bz-muted">
              Every Pioneer&apos;s profile, likes, matches and messages are kept private in their own Pi
              account. This build doesn&apos;t yet have a shared connection between different Pi accounts,
              so there&apos;s no real pool of other people to show here. Your profile and preferences are
              saved and ready — new Pioneers will appear once that shared connection exists.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
