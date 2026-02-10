"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type DraftItem = {
  id: string;
  createdAt: string;
  incomingEmail: string | null;
  generatedSubject: string;
  generatedBody: string;
  lead: {
    email: string;
    firstName: string | null;
    lastName: string | null;
    company: string | null;
    campaign: {
      name: string;
    };
  };
};

type DraftQueueProps = {
  initialDrafts: DraftItem[];
};

export function DraftQueue({ initialDrafts }: DraftQueueProps) {
  const [drafts, setDrafts] = useState(initialDrafts);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const router = useRouter();

  const countLabel = useMemo(() => `${drafts.length} pending`, [drafts.length]);

  async function approveDraft(draftId: string) {
    setLoadingId(draftId);
    try {
      const response = await fetch(`/api/drafts/${draftId}/approve`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ approvedBy: "dashboard_admin" })
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Unable to approve");
      }

      setDrafts((current) => current.filter((draft) => draft.id !== draftId));
      router.refresh();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Approval failed");
    } finally {
      setLoadingId(null);
    }
  }

  return (
    <div className="stack">
      <div className="badge">{countLabel}</div>
      {drafts.length === 0 && <p className="muted">No drafts waiting for approval.</p>}
      {drafts.length > 0 && (
        <div className="list">
          {drafts.map((draft) => (
            <article key={draft.id} className="row">
              <strong>{draft.generatedSubject}</strong>
              <p className="muted">
                {draft.lead.firstName || draft.lead.email} · {draft.lead.company || "Unknown company"} · {" "}
                {draft.lead.campaign.name}
              </p>
              {draft.incomingEmail && <p>{draft.incomingEmail.slice(0, 200)}</p>}
              <p>{draft.generatedBody.slice(0, 240)}</p>
              <button onClick={() => approveDraft(draft.id)} disabled={loadingId === draft.id}>
                {loadingId === draft.id ? "Approving..." : "Approve + Send"}
              </button>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
