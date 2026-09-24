"use client";

import { useRef, useState } from "react";
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
  type DatingProfile,
  type Gender,
  type LookingFor,
} from "@/lib/bezy/data";
import { saveLocalPhoto, clearPhotoUrl } from "@/lib/bezy/photos";
import {
  removeDatingPhoto,
  shrinkDatingPhoto,
  syncMediaMember,
  uploadDatingPhoto,
} from "@/lib/bezy/media";
import {
  Chip,
  Field,
  IconCamera,
  IconPlus,
  IconX,
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
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

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

  async function addPhoto(file: File) {
    if (draft.photos.length >= MAX_PHOTOS || uploading) return;
    setUploading(true);
    try {
      // No size limit: the photo is downscaled below, so any image from any camera works.
      await syncMediaMember(false, false, true);
      const prepared = await shrinkDatingPhoto(file);
      const id = await uploadDatingPhoto(prepared);
      try {
        await saveLocalPhoto(id, prepared);
        setPhotoError(null);
      } catch {
        setPhotoError("Photo is saved online, but local caching is unavailable on this device.");
      }
      onChange({ ...draft, photos: [...draft.photos, { id, hue: hueFor(id) }] });
    } catch (error) {
      setPhotoError(error instanceof Error ? error.message : "Photo could not be saved on this device.");
    } finally {
      setUploading(false);
    }
  }

  async function removePhoto(id: string) {
    try {
      await removeDatingPhoto(id);
      await clearPhotoUrl(id);
      setPhotoError(null);
      onChange({ ...draft, photos: draft.photos.filter((p) => p.id !== id) });
    } catch {
      setPhotoError("Photo could not be removed from this device. Try again.");
    }
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
              disabled={uploading}
              className="bz-press flex h-24 w-20 flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-bz-line text-bz-faint"
            >
              {draft.photos.length === 0 ? (
                <IconCamera className="h-6 w-6" />
              ) : (
                <IconPlus className="h-6 w-6" />
              )}
              <span className="text-[0.65rem] font-medium">{uploading ? "Saving…" : "Add"}</span>
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
            if (file) void addPhoto(file);
            e.target.value = "";
          }}
        />
        <p className="mt-2 text-xs leading-relaxed text-bz-faint">
          Photos are saved securely so other people can view them while your device is offline. They are only
          visible in discovery after you consent and make your profile discoverable.
        </p>
        {photoError && <p role="alert" className="mt-2 text-xs text-bz-danger">{photoError}</p>}
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
        <Field label="Area" hint="Type your own city if it isn't listed.">
          <TextInput
            value={draft.area}
            maxLength={40}
            placeholder="Your city"
            onChange={(e) => set("area", e.target.value.slice(0, 40))}
          />
        </Field>
      </div>

      {/* Suggestions, not a whitelist: a known area fills the field, and anything typed
          beyond the list is kept as-is and matched on text. */}
      <div className="-mt-1 flex flex-wrap gap-2">
        {AREAS.map((a) => (
          <Chip key={a} active={draft.area === a} onClick={() => set("area", a)}>
            {a}
          </Chip>
        ))}
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
