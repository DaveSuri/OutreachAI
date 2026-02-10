"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export function CampaignCreator() {
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const router = useRouter();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setLoading(true);

    try {
      const response = await fetch("/api/campaigns", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ name })
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Failed to create campaign");
      }

      setMessage(`Created campaign ${result.campaign.name}`);
      setName("");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to create campaign");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="stack" onSubmit={handleSubmit}>
      <input
        required
        placeholder="Campaign name"
        value={name}
        onChange={(event) => setName(event.target.value)}
      />
      <button disabled={loading}>{loading ? "Creating..." : "Create Campaign"}</button>
      {message && <p className="muted">{message}</p>}
    </form>
  );
}
