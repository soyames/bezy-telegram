"use client";

import { useState } from "react";
import { useBezy } from "@/contexts/bezy-context";
import { useNav } from "@/components/bezy/nav";
import { Sheet } from "@/components/bezy/pieces";
import { Button, Chip, IconFlag, TextArea } from "@/components/bezy/ui";
import { REPORT_REASONS, type ReportReason } from "@/lib/bezy/data";

export function ReportSheet() {
  const { reportTarget, closeReport } = useNav();
  const { reportProfile } = useBezy();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [note, setNote] = useState("");

  if (!reportTarget) return null;

  return (
    <Sheet
      onClose={() => {
        setReason(null);
        setNote("");
        closeReport();
      }}
    >
      <div className="flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-bz-danger-soft text-bz-danger">
          <IconFlag className="h-5 w-5" />
        </span>
        <div>
          <h3 className="font-display text-lg font-semibold text-bz-ink">Report {reportTarget.name}</h3>
          <p className="text-xs text-bz-muted">This immediately hides them from you.</p>
        </div>
      </div>

      <p className="mt-4 mb-2 text-sm font-semibold text-bz-ink">Why are you reporting?</p>
      <div className="flex flex-wrap gap-2">
        {REPORT_REASONS.map((r) => (
          <Chip key={r.id} active={reason === r.id} onClick={() => setReason(r.id)}>
            {r.label}
          </Chip>
        ))}
      </div>

      <div className="mt-4">
        <TextArea
          rows={3}
          maxLength={300}
          value={note}
          placeholder="Add anything that helps a moderator (optional)."
          onChange={(e) => setNote(e.target.value)}
        />
      </div>

      <p className="mt-3 rounded-2xl bg-bz-panel-2 px-3 py-2 text-xs leading-relaxed text-bz-muted">
        Wider action — hiding their profile from everyone or suspending the account — only happens after a
        moderator reviews your report.
      </p>

      <div className="mt-4 flex gap-2">
        <Button
          variant="outline"
          block
          onClick={() => {
            setReason(null);
            setNote("");
            closeReport();
          }}
        >
          Cancel
        </Button>
        <Button
          variant="danger"
          block
          disabled={!reason}
          onClick={() => {
            if (!reason) return;
            reportProfile(reportTarget.id, reportTarget.name, reason, note);
            setReason(null);
            setNote("");
            closeReport();
          }}
        >
          Send report
        </Button>
      </div>
    </Sheet>
  );
}
