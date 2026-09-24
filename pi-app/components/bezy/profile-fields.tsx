"use client";

import { useRef } from "react";
import {
  AREAS,
  GENDERS,
  INTERESTS,
  LOOKING_FOR,
  MAX_BIO,
  MAX_INTERESTS,
  MAX_PHOTOS,
  MIN_AGE,
  hueFor,
  makeId,
  type DatingProfile,
  type Gender,
  type LookingFor,
} from "@/lib/bezy/data";
import { setPhotoUrl, clearPhotoUrl } from "@/lib/bezy/photos";
import {
  Chip,
  Field,
  IconCamera,
  IconPlus,
  IconX,
  Select,
  TextArea,
  TextInput,
  cx,
} from "@/components/bezy/ui";
import { PhotoArt } from "@/components/bezy/pieces";

export function ProfileFields({
  draft,
  onChange,
}: {
  draft: DatingProfile;
  onChange: (next: DatingProfile) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  function set<K extends keyof DatingProfile>(key: K, value: DatingProfile[K]) {
    onChange({ ...draft, [key]: value });
  }

  function toggleInterest(tag: string) {
    const has = draft.interests.includes(tag);
    if (has) {
      set("interests", draft.interests.filter((t) => t !== tag));
    } else if (draft.interests.length < MAX_INTERESTS) {
      set("interests", [...draft.interests, tag]);
    }
  }

  function addPhoto(file: File) {
    if (draft.photos.length >= MAX_PHOTOS) return;
    const id = makeId("ph");
    const url = URL.createObjectURL(file);
    setPhotoUrl(id, url);
    set("photos", [...draft.photos, { id, hue: hueFor(id) }]);
  }

  function removePhoto(id: string) {
    clearPhotoUrl(id);
    set("photos", draft.photos.filter((p) => p.id !== id));
  }

  return (
    <div className="space-y-5">
      {/* Photos */}
      <div>
        <span className="mb-1.5 block text-sm font-semibold text-bz-ink">Photos</span>
        <div className="flex flex-wrap gap-3">
          {draft.photos.map((p, i) => (
            <div key={p.id} className="relative">
              <PhotoArt
                photo={p}
                name={draft.displayName || "You"}
                className="h-24 w-20"
                rounded="rounded-2xl"
              />
              {i === 0 ? (
                <span className="absolute left-1 top-1 rounded-full bg-black/45 px-1.5 py-0.5 text-[0.6rem] font-semibold text-white">
                  Main
                </span>
              ) : null}
              <button
                type="button"
                onClick={() => removePhoto(p.id)}
                aria-label="Remove photo"
                className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-bz-ink text-white shadow"
              >
                <IconX className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          {draft.photos.length < MAX_PHOTOS ? (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="bz-press flex h-24 w-20 flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-bz-line text-bz-faint"
            >
              {draft.photos.length === 0 ? (
                <IconCamera className="h-6 w-6" />
              ) : (
                <IconPlus className="h-6 w-6" />
              )}
              <span className="text-[0.65rem] font-medium">Add</span>
            </button>
          ) : null}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) addPhoto(file);
            e.target.value = "";
          }}
        />
        <p className="mt-2 text-xs leading-relaxed text-bz-faint">
          Photos you add are shown on your dating profile to people you can be discovered by. They stay on
          your device during this session and a warm placeholder shows if you reopen the app.
        </p>
      </div>

      <Field label="Display name" hint="A first name or nickname is perfect.">
        <TextInput
          value={draft.displayName}
          maxLength={40}
          placeholder="e.g. Alex"
          onChange={(e) => set("displayName", e.target.value)}
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Age" hint="Self-declared, 18+.">
          <TextInput
            inputMode="numeric"
            value={draft.age > 0 ? String(draft.age) : ""}
            placeholder="18"
            onChange={(e) => {
              const n = parseInt(e.target.value.replace(/\D/g, ""), 10);
              set("age", Number.isFinite(n) ? n : 0);
            }}
          />
        </Field>
        <Field label="Area">
          <Select value={draft.area} onChange={(e) => set("area", e.target.value)}>
            {AREAS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {draft.age > 0 && draft.age < MIN_AGE ? (
        <p className="rounded-2xl bg-bz-danger-soft px-3 py-2 text-xs font-medium text-bz-danger">
          Bezy is for adults only. You must be at least 18.
        </p>
      ) : null}

      <div>
        <span className="mb-2 block text-sm font-semibold text-bz-ink">I am a</span>
        <div className="flex flex-wrap gap-2">
          {GENDERS.map((g) => (
            <Chip
              key={g.id}
              active={draft.gender === g.id}
              onClick={() => set("gender", g.id as Gender)}
            >
              {g.label}
            </Chip>
          ))}
        </div>
      </div>

      <div>
        <span className="mb-2 block text-sm font-semibold text-bz-ink">Looking for</span>
        <div className="flex flex-wrap gap-2">
          {LOOKING_FOR.map((l) => (
            <Chip
              key={l.id}
              active={draft.lookingFor === l.id}
              onClick={() => set("lookingFor", l.id as LookingFor)}
            >
              {l.label}
            </Chip>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-semibold text-bz-ink">Interests</span>
          <span className="text-xs text-bz-faint">
            {draft.interests.length}/{MAX_INTERESTS}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {INTERESTS.map((tag) => {
            const active = draft.interests.includes(tag);
            const disabled = !active && draft.interests.length >= MAX_INTERESTS;
            return (
              <Chip
                key={tag}
                active={active}
                onClick={() => !disabled && toggleInterest(tag)}
                className={cx(disabled && "opacity-40")}
              >
                {tag}
              </Chip>
            );
          })}
        </div>
      </div>

      <Field label="About you" hint="A warm sentence or two goes a long way.">
        <div className="relative">
          <TextArea
            rows={4}
            maxLength={MAX_BIO}
            value={draft.bio}
            placeholder="Share what makes you, you — and what you're hoping to find."
            onChange={(e) => set("bio", e.target.value)}
          />
          <span className="pointer-events-none absolute bottom-2 right-3 text-[0.65rem] text-bz-faint">
            {draft.bio.length}/{MAX_BIO}
          </span>
        </div>
      </Field>

      <label className="flex items-start gap-3 rounded-2xl border border-bz-line bg-bz-panel-2 p-3">
        <input
          type="checkbox"
          checked={draft.photoConsent}
          onChange={(e) => set("photoConsent", e.target.checked)}
          className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--bz-rose)]"
        />
        <span className="text-sm leading-relaxed text-bz-muted">
          I consent to the photos and details above being visible to people I can be discovered by, in line
          with my privacy settings.
        </span>
      </label>
    </div>
  );
}
