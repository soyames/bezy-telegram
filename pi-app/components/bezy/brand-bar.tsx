"use client";

import Image from "next/image";
import { useNav } from "@/components/bezy/nav";
import { IconSettings } from "@/components/bezy/ui";
import bezyLockup from "@/lib/bezy/assets/bezy-logo-lockup.png";

/**
 * The Bezy brand bar, carried on every tab. It is the Telegram mini app's own header —
 * same tile size, radius, wordmark, tagline and settings button — so the two frontends
 * are the same product down to the chrome. The tagline is the English string from
 * locales/en.json; the Pi app has no locale catalogues yet.
 */
export function BrandBar() {
  const { openSettings } = useNav();

  return (
    <header className="bz-safe-top flex items-center justify-between gap-3 px-4 pb-1 pt-4">
      <div className="flex min-w-0 items-center gap-[10px]">
        <span className="relative block h-10 w-9 shrink-0 overflow-hidden rounded-[12px] border border-bz-line shadow-[0_1px_4px_rgba(99,39,155,0.08)]">
          <Image src={bezyLockup} alt="Bezy" fill sizes="36px" className="object-cover" priority />
        </span>
        <div className="min-w-0">
          <p className="font-display text-xl font-extrabold leading-none tracking-[-0.6px] text-bz-ink">
            Bezy <span aria-hidden="true">💗</span>
          </p>
          <p className="mt-0.5 truncate text-[11.5px] font-medium text-bz-plum/60">
            Meet someone worth knowing. 💗
          </p>
        </div>
      </div>
      <button
        onClick={openSettings}
        aria-label="Settings"
        className="bz-press flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-[14px] border border-bz-line bg-bz-panel text-bz-ink shadow-[0_5px_18px_rgba(31,23,43,0.07)]"
      >
        <IconSettings className="h-5 w-5" />
      </button>
    </header>
  );
}
