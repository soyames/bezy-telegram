"use client";

import { useState } from "react";
import { useBezy } from "@/contexts/bezy-context";
import { useNav } from "@/components/bezy/nav";
import { Overlay, OverlayHeader } from "@/components/bezy/pieces";
import { ProfileFields } from "@/components/bezy/profile-fields";
import { Button } from "@/components/bezy/ui";
import { emptyProfile, profileComplete, type DatingProfile } from "@/lib/bezy/data";

export function ProfileEdit() {
  const { editOpen, closeEdit } = useNav();
  const { profile, saveProfile } = useBezy();
  const [draft, setDraft] = useState<DatingProfile>(profile ?? emptyProfile());

  if (!editOpen) return null;

  const canSave = profileComplete(draft) && draft.photoConsent;

  return (
    <Overlay onClose={closeEdit}>
      <OverlayHeader
        title="Edit profile"
        onBack={closeEdit}
        right={
          <Button
            className="px-4 py-2"
            disabled={!canSave}
            onClick={() => {
              saveProfile(draft);
              closeEdit();
            }}
          >
            Save
          </Button>
        }
      />
      <div className="flex-1 overflow-y-auto bz-no-scrollbar p-5">
        <ProfileFields draft={draft} onChange={setDraft} />
        {!canSave ? (
          <p className="mt-4 text-center text-xs text-bz-faint">
            Keep a name, age (18+), gender, area, at least one interest, a short bio, and photo consent to
            stay discoverable.
          </p>
        ) : null}
      </div>
    </Overlay>
  );
}
