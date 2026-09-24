"use client";

import { useBezy } from "@/contexts/bezy-context";
import { useNav } from "@/components/bezy/nav";
import { PhotoArt } from "@/components/bezy/pieces";
import {
  IconChevron,
  IconEdit,
  IconEye,
  IconGavel,
  IconHeartFilled,
  IconLock,
  IconPin,
  IconSettings,
  IconShield,
  IconStar,
  Pill,
  cx,
} from "@/components/bezy/ui";
import { genderLabel, lookingForLabel, premiumExpiryLabel } from "@/lib/bezy/data";

export function ProfileScreen() {
  const { profile, prefs, matches, reports, premium, isPremiumActive } = useBezy();
  const { openEdit, openSettings, openModeration, openPremium } = useNav();

  if (!profile) return null;

  return (
    <div className="flex min-h-full flex-col">
      <header className="bz-safe-top flex items-center justify-between px-5 pb-2 pt-4">
        <h1 className="font-display text-2xl font-bold text-bz-ink">You</h1>
        <button
          onClick={openSettings}
          aria-label="Settings"
          className="bz-press flex h-10 w-10 items-center justify-center rounded-full border border-bz-line bg-bz-panel text-bz-ink"
        >
          <IconSettings className="h-5 w-5" />
        </button>
      </header>

      <div className="flex-1 px-5 pb-6">
        {/* Preview card */}
        <div className="relative overflow-hidden rounded-[1.75rem] border border-bz-line">
          <PhotoArt
            photo={profile.photos[0]}
            name={profile.displayName}
            hueA={12}
            hueB={340}
            rounded="rounded-none"
            className="aspect-[5/6] w-full"
          />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-5 pt-14">
            <h2 className="font-display text-2xl font-bold text-white">
              {profile.displayName} <span className="text-white/85">{profile.age}</span>
            </h2>
            <p className="mt-0.5 flex items-center gap-1.5 text-sm text-white/85">
              <IconPin className="h-4 w-4" />
              {profile.area}
            </p>
          </div>
          <button
            onClick={openEdit}
            className="bz-press absolute right-4 top-4 flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-2 text-sm font-semibold text-bz-ink shadow"
          >
            <IconEdit className="h-4 w-4" />
            Edit
          </button>
        </div>

        {prefs.paused ? (
          <div className="mt-3 flex items-center gap-2 rounded-2xl bg-bz-peach-soft px-4 py-3 text-sm text-bz-ink">
            <IconEye className="h-5 w-5 text-bz-rose" />
            Your profile is paused and hidden from discovery.
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-2">
          <Pill tone="rose">{lookingForLabel(profile.lookingFor)}</Pill>
          <Pill tone="plum">{genderLabel(profile.gender)}</Pill>
          {profile.interests.slice(0, 6).map((t) => (
            <Pill key={t} tone="peach">
              {t}
            </Pill>
          ))}
        </div>

        {profile.bio ? (
          <p className="bz-pre mt-4 text-sm leading-relaxed text-bz-muted">{profile.bio}</p>
        ) : null}

        {/* Stats */}
        <div className="mt-5 grid grid-cols-2 gap-3">
          <Stat label="Matches" value={matches.length} icon={<IconHeartFilled className="h-4 w-4" />} />
          <Stat label="Reports sent" value={reports.length} icon={<IconShield className="h-4 w-4" />} />
        </div>

        {/* Quick links */}
        <div className="mt-5 overflow-hidden rounded-2xl border border-bz-line bg-bz-panel">
          <LinkRow icon={<IconEye className="h-5 w-5" />} label="Privacy & discovery" onClick={openSettings} />
          <LinkRow icon={<IconLock className="h-5 w-5" />} label="Safety & blocked people" onClick={openSettings} />
          <LinkRow
            icon={<IconGavel className="h-5 w-5" />}
            label="Moderation queue"
            onClick={openModeration}
          />
        </div>

        {/* Premium */}
        <button
          onClick={openPremium}
          className="bz-press mt-5 block w-full overflow-hidden rounded-2xl border border-bz-line bg-bz-plum-soft p-4 text-left"
        >
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/70 text-bz-plum">
              <IconStar className="h-5 w-5" />
            </span>
            <p className="font-display text-base font-semibold text-bz-plum">Bezy Premium</p>
            <Pill tone="plum" className="ml-auto">
              {isPremiumActive ? "Active" : "Upgrade"}
            </Pill>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-bz-plum/90">
            {isPremiumActive
              ? `Active until ${premiumExpiryLabel(premium.expiresAt)}. See everyone who liked you.`
              : "See who already liked you and match by liking back — paid once in Pi."}
          </p>
        </button>

        <p className="mt-6 text-center text-xs leading-relaxed text-bz-faint">
          Age on Bezy is self-declared — there is no verified age check. Please be honest and report anyone
          who seems underage.
        </p>
      </div>
    </div>
  );
}

function Stat({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-bz-line bg-bz-panel p-4">
      <div className="flex items-center gap-1.5 text-bz-rose">{icon}</div>
      <p className="mt-1 font-display text-2xl font-bold text-bz-ink">{value}</p>
      <p className="text-xs text-bz-muted">{label}</p>
    </div>
  );
}

function LinkRow({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cx(
        "bz-press flex w-full items-center gap-3 border-b border-bz-line-soft px-4 py-3.5 text-left last:border-0",
      )}
    >
      <span className="text-bz-muted">{icon}</span>
      <span className="flex-1 text-sm font-semibold text-bz-ink">{label}</span>
      <IconChevron className="h-4 w-4 text-bz-faint" />
    </button>
  );
}
