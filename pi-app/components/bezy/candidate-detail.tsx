"use client";

import { useBezy } from "@/contexts/bezy-context";
import { useNav } from "@/components/bezy/nav";
import { ConfirmButton, Overlay, OverlayHeader, PersonPhoto } from "@/components/bezy/pieces";
import {
  Button,
  IconBan,
  IconFlag,
  IconHeartFilled,
  IconPin,
  IconSpark,
  IconX,
  Pill,
} from "@/components/bezy/ui";
import {
  genderLabel,
  lookingForLabel,
  sharedInterests,
  type SharedPerson,
} from "@/lib/bezy/data";

export function CandidateDetail() {
  const { candidateId, closeCandidate, openReport } = useNav();
  const { getSeed, profile, likeProfile, passProfile, blockProfile, toast } = useBezy();
  const seed = candidateId ? getSeed(candidateId) : undefined;

  if (!seed) return null;

  const shared = sharedInterests(profile?.interests ?? [], seed.interests);
  const mine = new Set(profile?.interests ?? []);
  // getSeed keeps its seed signature; people from the community service carry photos on
  // top of it. Which network they came from is never shown — one community, one profile.
  const serverPerson = seed as Partial<SharedPerson>;
  const photoIds = serverPerson.photoIds ?? [];

  return (
    <Overlay onClose={closeCandidate}>
      <OverlayHeader title={`${seed.name}, ${seed.age}`} onBack={closeCandidate} />
      <div className="flex-1 overflow-y-auto bz-no-scrollbar">
        <PersonPhoto
          ownerId={seed.id}
          photoId={photoIds[0]}
          name={seed.name}
          hueA={seed.hueA}
          hueB={seed.hueB}
          rounded="rounded-none"
          className="aspect-[4/5] w-full"
        />
        {photoIds.length > 1 ? (
          <div className="flex gap-2 overflow-x-auto bz-no-scrollbar px-5 pt-3">
            {photoIds.slice(1).map((id) => (
              <PersonPhoto
                key={id}
                ownerId={seed.id}
                photoId={id}
                name={seed.name}
                hueA={seed.hueA}
                hueB={seed.hueB}
                rounded="rounded-2xl"
                className="h-24 w-20 shrink-0"
              />
            ))}
          </div>
        ) : null}
        <div className="space-y-5 p-5">
          <div>
            <h2 className="font-display text-2xl font-bold text-bz-ink">
              {seed.name} <span className="text-bz-muted">{seed.age}</span>
            </h2>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-bz-muted">
              <IconPin className="h-4 w-4" />
              {seed.area}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Pill tone="rose">{lookingForLabel(seed.lookingFor)}</Pill>
              <Pill tone="plum">{genderLabel(seed.gender)}</Pill>
              {shared > 0 ? (
                <Pill tone="peach">
                  <IconSpark className="h-3.5 w-3.5" />
                  {shared} in common
                </Pill>
              ) : null}
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-sm font-semibold text-bz-ink">About</p>
            <p className="bz-pre text-sm leading-relaxed text-bz-muted">{seed.bio}</p>
          </div>

          <div>
            <p className="mb-2 text-sm font-semibold text-bz-ink">Interests</p>
            <div className="flex flex-wrap gap-2">
              {seed.interests.map((tag) => (
                <span
                  key={tag}
                  className={
                    mine.has(tag)
                      ? "rounded-full bg-bz-rose-soft px-3 py-1.5 text-sm font-medium text-bz-rose-deep"
                      : "rounded-full bg-bz-panel-2 px-3 py-1.5 text-sm font-medium text-bz-muted"
                  }
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>

          <div className="space-y-3 border-t border-bz-line pt-4">
            <button
              onClick={() => openReport({ id: seed.id, name: seed.name })}
              className="bz-press inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium text-bz-muted"
            >
              <IconFlag className="h-4 w-4" />
              Report
            </button>
            {/* Blocking is one-way for the other member and ends any match, so it asks
                first — as Unmatch already does. */}
            <ConfirmButton
              icon={<IconBan className="h-4 w-4" />}
              label="Block"
              confirmLabel="Tap again — this ends your match"
              onConfirm={() => {
                blockProfile(seed.id, seed.name);
                closeCandidate();
              }}
            />
          </div>
        </div>
      </div>

      <div className="bz-safe-bottom flex items-center justify-center gap-6 border-t border-bz-line bg-bz-panel px-5 py-3">
        <button
          onClick={() => {
            void passProfile(seed.id);
            closeCandidate();
          }}
          aria-label="Pass"
          className="bz-press flex h-14 w-14 items-center justify-center rounded-full border border-bz-line bg-bz-panel text-bz-muted"
        >
          <IconX className="h-6 w-6" />
        </button>
        <Button
          className="flex-1"
          block
          onClick={() => {
            closeCandidate();
            // The answer comes from the backend: it's the only side that knows whether
            // the other person liked back.
            void likeProfile(seed.id).then((res) => {
              if (res.matched) toast(`It's a match with ${seed.name}!`, "rose");
              else toast("Liked — we'll let you know if it's mutual.", "rose");
            });
          }}
        >
          <IconHeartFilled className="h-4 w-4" />
          Like {seed.name}
        </Button>
      </div>
    </Overlay>
  );
}
