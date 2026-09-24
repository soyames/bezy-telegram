"use client";

import { useState } from "react";
import { useBezy } from "@/contexts/bezy-context";
import { useNav } from "@/components/bezy/nav";
import { ConfirmButton, Overlay, OverlayHeader } from "@/components/bezy/pieces";
import {
  Button,
  Chip,
  Eyebrow,
  IconBan,
  IconChevron,
  IconInfo,
  IconStar,
  IconTrash,
  Pill,
  Select,
  TextInput,
  cx,
} from "@/components/bezy/ui";
import {
  GENDERS,
  VISIBILITY,
  WHO_CAN_MESSAGE,
  premiumExpiryLabel,
  type Gender,
  type Visibility,
  type WhoCanMessage,
} from "@/lib/bezy/data";

export function SettingsScreen() {
  const { settingsOpen, closeSettings, openPremium } = useNav();
  const { prefs, savePrefs, blocked, getSeed, deleteAccount, toast, premium, isPremiumActive } = useBezy();
  const [deleting, setDeleting] = useState(false);

  if (!settingsOpen) return null;

  function toggleInterested(g: Gender) {
    const has = prefs.interestedIn.includes(g);
    const next = has ? prefs.interestedIn.filter((x) => x !== g) : [...prefs.interestedIn, g];
    if (next.length) savePrefs({ ...prefs, interestedIn: next });
  }

  return (
    <Overlay onClose={closeSettings}>
      <OverlayHeader title="Privacy & settings" onBack={closeSettings} />
      <div className="flex-1 overflow-y-auto bz-no-scrollbar p-5">
        {/* Premium */}
        <section className="space-y-3">
          <Eyebrow>Premium</Eyebrow>
          <button
            onClick={openPremium}
            className="bz-press flex w-full items-center gap-3 rounded-2xl border border-bz-line bg-bz-panel p-4 text-left"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-bz-plum-soft text-bz-plum">
              <IconStar className="h-5 w-5" />
            </span>
            <div className="flex-1">
              <p className="text-sm font-semibold text-bz-ink">Upgrade to Premium</p>
              <p className="mt-0.5 text-xs leading-relaxed text-bz-muted">
                {isPremiumActive
                  ? `Active until ${premiumExpiryLabel(premium.expiresAt)} · manage renewal`
                  : "Unlock who liked you, filters, extra Super Likes and more"}
              </p>
            </div>
            {isPremiumActive ? <Pill tone="plum">Active</Pill> : null}
            <IconChevron className="h-4 w-4 text-bz-faint" />
          </button>
        </section>

        {/* Discovery status */}
        <section className="space-y-3">
          <Eyebrow>Discovery</Eyebrow>
          <Toggle
            label="Pause my profile"
            desc="Hide yourself and stop seeing new people. Matches and chats stay."
            on={prefs.paused}
            onChange={(v) => {
              savePrefs({ ...prefs, paused: v });
              toast(v ? "Profile paused." : "Profile active again.");
            }}
          />
          <Toggle
            label="Widen my area"
            desc="Include nearby broad areas as well as your own."
            on={prefs.widenArea}
            onChange={(v) => savePrefs({ ...prefs, widenArea: v })}
          />
        </section>

        {/* Who sees me */}
        <section className="mt-6 space-y-3">
          <Eyebrow>Who can see me</Eyebrow>
          <div className="space-y-2">
            {VISIBILITY.map((v) => (
              <OptionRow
                key={v.id}
                active={prefs.visibility === v.id}
                label={v.label}
                desc={v.desc}
                onClick={() => savePrefs({ ...prefs, visibility: v.id as Visibility })}
              />
            ))}
          </div>
        </section>

        {/* Who can message me */}
        <section className="mt-6 space-y-3">
          <Eyebrow>Who can message me</Eyebrow>
          <div className="space-y-2">
            {WHO_CAN_MESSAGE.map((v) => (
              <OptionRow
                key={v.id}
                active={prefs.whoCanMessage === v.id}
                label={v.label}
                desc={v.desc}
                onClick={() => savePrefs({ ...prefs, whoCanMessage: v.id as WhoCanMessage })}
              />
            ))}
          </div>
        </section>

        {/* Preferences */}
        <section className="mt-6 space-y-3">
          <Eyebrow>Preferences</Eyebrow>
          <div className="rounded-2xl border border-bz-line bg-bz-panel p-4">
            <p className="mb-2 text-sm font-semibold text-bz-ink">Show me</p>
            <div className="flex flex-wrap gap-2">
              {GENDERS.map((g) => (
                <Chip
                  key={g.id}
                  active={prefs.interestedIn.includes(g.id)}
                  onClick={() => toggleInterested(g.id)}
                >
                  {g.label}
                </Chip>
              ))}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-bz-muted">Youngest</span>
                <TextInput
                  inputMode="numeric"
                  value={String(prefs.ageMin)}
                  onChange={(e) => {
                    const n = parseInt(e.target.value.replace(/\D/g, ""), 10);
                    savePrefs({ ...prefs, ageMin: Number.isFinite(n) ? Math.max(18, n) : 18 });
                  }}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-bz-muted">Oldest</span>
                <TextInput
                  inputMode="numeric"
                  value={String(prefs.ageMax)}
                  onChange={(e) => {
                    const n = parseInt(e.target.value.replace(/\D/g, ""), 10);
                    savePrefs({ ...prefs, ageMax: Number.isFinite(n) ? Math.max(18, n) : 45 });
                  }}
                />
              </label>
            </div>
          </div>
        </section>

        {/* Blocked */}
        <section className="mt-6 space-y-3">
          <Eyebrow>Blocked people</Eyebrow>
          {blocked.length === 0 ? (
            <p className="rounded-2xl border border-bz-line bg-bz-panel px-4 py-3 text-sm text-bz-muted">
              You haven&apos;t blocked anyone. Blocking removes someone from your discovery and messaging —
              and removes you from theirs.
            </p>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-bz-line bg-bz-panel">
              {blocked.map((id) => {
                const seed = getSeed(id);
                return (
                  <div
                    key={id}
                    className="flex items-center gap-3 border-b border-bz-line-soft px-4 py-3 last:border-0"
                  >
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-bz-danger-soft text-bz-danger">
                      <IconBan className="h-4 w-4" />
                    </span>
                    <span className="flex-1 text-sm font-medium text-bz-ink">
                      {seed?.name ?? "Blocked person"}
                    </span>
                    <span className="text-xs text-bz-faint">Blocked</span>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Safety note */}
        <section className="mt-6">
          <div className="flex items-start gap-3 rounded-2xl bg-bz-panel-2 p-4 text-xs leading-relaxed text-bz-muted">
            <IconInfo className="mt-0.5 h-4 w-4 shrink-0 text-bz-rose" />
            <span>
              Your visibility and messaging rules are enforced on both sides — a person only appears in
              discovery when you fit each other&apos;s preferences. Bezy never uses GPS or shows precise
              distance.
            </span>
          </div>
        </section>

        {/* Delete account */}
        <section className="mt-6 space-y-3">
          <Eyebrow>Danger zone</Eyebrow>
          <div className="rounded-2xl border border-bz-danger/30 bg-bz-danger-soft p-4">
            <p className="text-sm font-semibold text-bz-danger">Delete dating profile</p>
            <p className="mt-1 text-xs leading-relaxed text-bz-danger/90">
              This permanently removes your dating profile, photos, messages, matches, and every like, pass,
              block, and report from your Pi account. This can&apos;t be undone.
            </p>
            <div className="mt-3">
              <ConfirmButton
                label="Delete my dating profile"
                confirmLabel="Tap again to permanently delete"
                icon={<IconTrash className="h-4 w-4" />}
                onConfirm={async () => {
                  setDeleting(true);
                  try {
                    await deleteAccount();
                    closeSettings();
                  } catch {
                    // Keep the profile visible locally until private media has
                    // actually been removed on the backend. Retry is possible.
                  } finally {
                    setDeleting(false);
                  }
                }}
              />
              {deleting ? (
                <p className="mt-2 text-center text-xs text-bz-danger">Removing your data…</p>
              ) : null}
            </div>
          </div>
        </section>
      </div>
    </Overlay>
  );
}

function Toggle({
  label,
  desc,
  on,
  onChange,
}: {
  label: string;
  desc: string;
  on: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!on)}
      className="bz-press flex w-full items-center gap-3 rounded-2xl border border-bz-line bg-bz-panel p-4 text-left"
    >
      <div className="flex-1">
        <p className="text-sm font-semibold text-bz-ink">{label}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-bz-muted">{desc}</p>
      </div>
      <span
        className={cx(
          "relative h-7 w-12 shrink-0 rounded-full transition-colors",
          on ? "bg-bz-rose" : "bg-bz-line",
        )}
      >
        <span
          className={cx(
            "absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all",
            on ? "left-6" : "left-1",
          )}
        />
      </span>
    </button>
  );
}

function OptionRow({
  active,
  label,
  desc,
  onClick,
}: {
  active: boolean;
  label: string;
  desc: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cx(
        "bz-press flex w-full items-start gap-3 rounded-2xl border p-4 text-left",
        active ? "border-bz-rose bg-bz-rose-soft" : "border-bz-line bg-bz-panel",
      )}
    >
      <span
        className={cx(
          "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2",
          active ? "border-bz-rose bg-bz-rose" : "border-bz-line",
        )}
      >
        {active ? <span className="h-2 w-2 rounded-full bg-white" /> : null}
      </span>
      <div>
        <p className="text-sm font-semibold text-bz-ink">{label}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-bz-muted">{desc}</p>
      </div>
    </button>
  );
}
