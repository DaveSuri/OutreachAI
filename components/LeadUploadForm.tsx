"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

type CampaignOption = {
  id: string;
  name: string;
  status: string;
};

type LeadUploadFormProps = {
  campaigns: CampaignOption[];
};

const sampleCSV = `email,firstName,lastName,company
ceo@example.com,Ava,Stone,Northwind
ops@example.com,Noah,Shah,Acme Labs`;

export function LeadUploadForm({ campaigns }: LeadUploadFormProps) {
  const [campaignId, setCampaignId] = useState(campaigns[0]?.id || "");
  const [csv, setCsv] = useState(sampleCSV);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const router = useRouter();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!campaignId) {
      setMessage("Create a campaign first.");
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      const response = await fetch("/api/campaigns/upload", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          campaignId,
          csv
        })
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Upload failed");
      }

      setMessage(`Ingested ${result.ingested}. Created ${result.created}. Updated ${result.updated}.`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="stack" onSubmit={handleSubmit}>
      <select value={campaignId} onChange={(event) => setCampaignId(event.target.value)}>
        {campaigns.length === 0 && <option value="">No campaigns available</option>}
        {campaigns.map((campaign) => (
          <option key={campaign.id} value={campaign.id}>
            {campaign.name} ({campaign.status})
          </option>
        ))}
      </select>
      <textarea value={csv} onChange={(event) => setCsv(event.target.value)} />
      <button className="secondary" disabled={loading}>
        {loading ? "Uploading..." : "Upload Leads + Trigger Campaign"}
      </button>
      {message && <p className="muted">{message}</p>}
    </form>
  );
}
