"use client";

import { useEffect, useState } from "react";
import { useBezy } from "@/contexts/bezy-context";
import { useNav } from "@/components/bezy/nav";
import { PersonPhoto } from "@/components/bezy/pieces";
import {
  Button,
  IconHeartFilled,
  IconPin,
  IconX,
  Pill,
  Spinner,
} from "@/components/bezy/ui";
import { lookingForLabel, type SharedPerson } from "@/lib/bezy/data";

export function DiscoverScreen() {
  const {
    profile,
    prefs,
    savePrefs,
    toast,
    discovery,
    discoveryLoading,
    socialTrouble,
    refreshDiscovery,
    likeProfile,
    passProfile,
  } = useBezy();
  const { openCandidate } = useNav();
  const [index, setIndex] = useState(0);

  // The stack is the live discovery list: whoever you decide on leaves it straight away,
  // and a fresh stack from the community service starts from the top.
  const discoveryIds = discovery.map((person) => person.id).join("|");
  useEffect(() => {
    setIndex(0);
  }, [discoveryIds]);

  const person = discovery.length
    ? discovery[Math.min(index, discovery.length - 1)]
    : undefined;
  const loading = discoveryLoading && !person;

  function pass(who: SharedPerson) {
    void passProfile(who.id);
    setIndex((i) => i + 1);
  }

  async function like(who: SharedPerson) {
    const result = await likeProfile(who.id);
    setIndex((i) => i + 1);
    if (result.matched) toast(`It's a match with ${who.name}!`, "rose");
    else toast("Liked — we'll let you know if it's mutual.", "rose");
  }

  return (
    <div className="flex min-h-full flex-col">
      {/* The brand lives in the shell's brand bar now, so this row only carries where the
          member is searching. */}
      <header className="flex items-center justify-between px-5 pb-2 pt-1">
        <Pill tone="rose">
          <IconPin className="h-3.5 w-3.5" />
          {prefs.widenArea ? "Wider area" : profile?.area}
        </Pill>
      </header>

      {socialTrouble && !prefs.paused ? (
        <div className="mx-5 mb-2 flex items-center gap-3 rounded-2xl bg-bz-peach-soft px-3.5 py-2.5">
          <p className="flex-1 text-xs leading-relaxed text-bz-ink">
            Couldn&apos;t reach Bezy&apos;s community service.
          </p>
          <button
            onClick={() => void refreshDiscovery()}
            disabled={discoveryLoading}
            className="bz-press shrink-0 text-xs font-semibold text-bz-rose-deep disabled:opacity-50"
          >
            Retry
          </button>
        </div>
      ) : null}

      {prefs.paused ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 pb-10 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-bz-rose-soft text-bz-rose">
            <IconHeartFilled className="h-8 w-8" />
          </div>
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
        </div>
      ) : loading ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 pb-10 text-center">
          <Spinner className="h-6 w-6 text-bz-rose" />
          <p className="text-sm text-bz-muted">Looking for people who fit you both…</p>
        </div>
      ) : person ? (
        <div className="flex flex-1 flex-col px-5 pb-4">
          <button
            onClick={() => openCandidate(person.id)}
            className="bz-press relative block w-full overflow-hidden rounded-[1.75rem] border border-bz-line bg-bz-panel text-left"
          >
            <PersonPhoto
              ownerId={person.id}
              photoId={person.photoIds[0]}
              name={person.name}
              hueA={person.hueA}
              hueB={person.hueB}
              rounded="rounded-none"
              className="aspect-[4/5] w-full"
            />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-5 pt-14">
              <div className="flex items-center gap-2">
                <h2 className="font-display text-2xl font-bold text-white">
                  {person.name} <span className="text-white/85">{person.age}</span>
                </h2>
              </div>
              <p className="mt-0.5 flex items-center gap-1.5 text-sm text-white/85">
                <IconPin className="h-4 w-4" />
                {person.area}
              </p>
            </div>
          </button>

          <div className="mt-3 flex flex-wrap gap-2">
            <Pill tone="rose">{lookingForLabel(person.lookingFor)}</Pill>
            {person.interests.slice(0, 4).map((tag) => (
              <Pill key={tag} tone="peach">
                {tag}
              </Pill>
            ))}
          </div>

          <div className="mt-auto pt-4">
            <p className="mb-2 text-center text-xs text-bz-faint">
              {Math.min(index + 1, discovery.length)} of {discovery.length} · tap the card for their
              full profile
            </p>
            <div className="flex items-center gap-3">
              <button
                onClick={() => pass(person)}
                aria-label="Pass"
                className="bz-press flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-bz-line bg-bz-panel text-bz-muted"
              >
                <IconX className="h-6 w-6" />
              </button>
              <Button className="flex-1" block onClick={() => void like(person)}>
                <IconHeartFilled className="h-4 w-4" />
                Like {person.name}
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 pb-10 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-bz-rose-soft text-bz-rose">
            <IconHeartFilled className="h-8 w-8" />
          </div>
          <h2 className="font-display text-xl font-semibold text-bz-ink">No one to show yet</h2>
          <p className="max-w-xs text-sm leading-relaxed text-bz-muted">
            Check back soon — new people appear here as they join Bezy and fit both of your
            preferences. Widening your area or your age range in settings also brings more people in.
          </p>
          <Button
            className="mt-2"
            disabled={discoveryLoading}
            onClick={() => void refreshDiscovery()}
          >
            Refresh
          </Button>
        </div>
      )}
    </div>
  );
}
