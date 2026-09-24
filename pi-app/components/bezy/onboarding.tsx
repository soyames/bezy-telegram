"use client";

import { useState } from "react";
import { useBezy } from "@/contexts/bezy-context";
import {
  GENDERS,
  defaultPrefs,
  emptyProfile,
  profileComplete,
  type DatingPrefs,
  type DatingProfile,
  type Gender,
} from "@/lib/bezy/data";
import {
  BezyLogo,
  Button,
  Chip,
  Field,
  IconCheck,
  IconLock,
  IconShield,
  IconSpark,
  TextInput,
  cx,
} from "@/components/bezy/ui";
import { SelectCard } from "@/components/bezy/pieces";
import { ProfileFields } from "@/components/bezy/profile-fields";

type Step = "welcome" | "consent" | "profile" | "prefs";

export function Onboarding() {
  const { completeOnboarding } = useBezy();
  const [step, setStep] = useState<Step>("welcome");
  const [adult, setAdult] = useState(false);
  const [terms, setTerms] = useState(false);
  const [draft, setDraft] = useState<DatingProfile>(emptyProfile());
  const [prefs, setPrefs] = useState<DatingPrefs>(defaultPrefs());

  const canConsent = adult && terms;
  const canProfile = profileComplete(draft) && draft.photoConsent;

  function toggleInterested(g: Gender) {
    const has = prefs.interestedIn.includes(g);
    const next = has
      ? prefs.interestedIn.filter((x) => x !== g)
      : [...prefs.interestedIn, g];
    setPrefs({ ...prefs, interestedIn: next.length ? next : prefs.interestedIn });
  }

  return (
    <div className="bz-app-bg min-h-[100dvh]">
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col bz-safe-top bz-safe-bottom">
        {step === "welcome" && (
          <div className="anim-fade-up flex flex-1 flex-col justify-center px-6 py-10">
            <span className="mb-6 inline-flex w-fit items-center rounded-xl bg-bz-brand-surface px-3 py-2">
              <BezyLogo className="h-12 w-48" />
            </span>
            <h1 className="font-display text-4xl font-bold leading-tight text-bz-ink">
              Meet people,
              <br />
              the warm way.
            </h1>
            <p className="mt-4 text-[0.95rem] leading-relaxed text-bz-muted">
              Bezy is a kind, consent-first dating space for adult Pioneers. You choose who can find you and
              who can message you — and you match on what you have in common, not where you happen to be
              standing.
            </p>
            <div className="mt-8 space-y-3">
              <WelcomeRow icon={<IconShield className="h-5 w-5" />} title="Consent-first">
                Your visibility and messaging rules are honored on both sides.
              </WelcomeRow>
              <WelcomeRow icon={<IconSpark className="h-5 w-5" />} title="Matched on interests">
                No GPS and no precise distance — ever.
              </WelcomeRow>
              <WelcomeRow icon={<IconLock className="h-5 w-5" />} title="Yours to control">
                Pause, hide, block, report, or delete at any time.
              </WelcomeRow>
            </div>
            <Button className="mt-8" block onClick={() => setStep("consent")}>
              Get started
            </Button>
          </div>
        )}

        {step === "consent" && (
          <div className="anim-fade-up flex flex-1 flex-col px-6 py-8">
            <h2 className="font-display text-2xl font-bold text-bz-ink">Before we begin</h2>
            <p className="mt-2 text-sm leading-relaxed text-bz-muted">
              A couple of important things, in plain language.
            </p>

            <div className="mt-6 space-y-3">
              <SelectCard control="check" active={adult} onClick={() => setAdult((v) => !v)}>
                <strong className="font-semibold text-bz-ink">I am 18 or older.</strong> Age here is
                self-declared. Bezy does not run a verified age check — please be honest, and report anyone
                who appears underage.
              </SelectCard>
              <SelectCard control="check" active={terms} onClick={() => setTerms((v) => !v)}>
                <strong className="font-semibold text-bz-ink">I accept the community & consent terms.</strong>{" "}
                Be respectful, only share what you're comfortable being seen, and treat every match with
                kindness.
              </SelectCard>
            </div>

            <div className="mt-6 rounded-2xl border border-bz-line bg-bz-panel-2 p-4 text-xs leading-relaxed text-bz-muted">
              Your dating profile is separate from any other app profile. You decide who can see you and who
              can reach you, and you can change or remove everything whenever you like.
            </div>

            <div className="mt-auto pt-6">
              <Button block disabled={!canConsent} onClick={() => setStep("profile")}>
                Continue
              </Button>
            </div>
          </div>
        )}

        {step === "profile" && (
          <div className="anim-fade-up flex flex-1 flex-col px-6 py-8">
            <h2 className="font-display text-2xl font-bold text-bz-ink">Create your profile</h2>
            <p className="mt-2 text-sm leading-relaxed text-bz-muted">
              This is what possible matches will see. You can edit any of it later.
            </p>
            <div className="mt-6">
              <ProfileFields draft={draft} onChange={setDraft} />
            </div>
            <div className="mt-8">
              <Button block disabled={!canProfile} onClick={() => setStep("prefs")}>
                Continue
              </Button>
              {!canProfile ? (
                <p className="mt-2 text-center text-xs text-bz-faint">
                  Add a name, age (18+), gender, area, an interest, a short bio, and confirm photo consent.
                </p>
              ) : null}
            </div>
          </div>
        )}

        {step === "prefs" && (
          <div className="anim-fade-up flex flex-1 flex-col px-6 py-8">
            <h2 className="font-display text-2xl font-bold text-bz-ink">Who you'd like to meet</h2>
            <p className="mt-2 text-sm leading-relaxed text-bz-muted">
              These filters shape discovery. Each person's own preferences are honored too, so matches feel
              mutual from the start.
            </p>

            <div className="mt-6 space-y-6">
              <div>
                <span className="mb-2 block text-sm font-semibold text-bz-ink">Show me</span>
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
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Youngest">
                  <TextInput
                    inputMode="numeric"
                    value={String(prefs.ageMin)}
                    onChange={(e) => {
                      const n = parseInt(e.target.value.replace(/\D/g, ""), 10);
                      setPrefs({ ...prefs, ageMin: Number.isFinite(n) ? n : 18 });
                    }}
                  />
                </Field>
                <Field label="Oldest">
                  <TextInput
                    inputMode="numeric"
                    value={String(prefs.ageMax)}
                    onChange={(e) => {
                      const n = parseInt(e.target.value.replace(/\D/g, ""), 10);
                      setPrefs({ ...prefs, ageMax: Number.isFinite(n) ? n : 45 });
                    }}
                  />
                </Field>
              </div>

              <div className="rounded-2xl border border-bz-line bg-bz-panel-2 p-4 text-xs leading-relaxed text-bz-muted">
                Bezy shows people in your chosen area — you can widen this later. You'll never see an
                unfiltered feed of everyone nearby.
              </div>
            </div>

            <div className="mt-auto pt-8">
              <Button
                block
                onClick={() => {
                  let min = Math.max(18, prefs.ageMin);
                  let max = Math.max(18, prefs.ageMax);
                  if (min > max) [min, max] = [max, min];
                  completeOnboarding(draft, { ...prefs, ageMin: min, ageMax: max });
                }}
              >
                <IconCheck className="h-4 w-4" />
                Enter Bezy
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function WelcomeRow({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-bz-line bg-bz-panel p-3.5">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-bz-rose-soft text-bz-rose">
        {icon}
      </div>
      <div>
        <p className="text-sm font-semibold text-bz-ink">{title}</p>
        <p className="text-xs leading-relaxed text-bz-muted">{children}</p>
      </div>
    </div>
  );
}

