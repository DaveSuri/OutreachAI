"use client";

import { useMemo, useState } from "react";

type Message = {
  id: string;
  role: "user" | "assistant";
  text: string;
};

type VoiceToolResponse = {
  toolName: "get_dashboard_stats" | "query_hot_leads";
  payload: unknown;
  message: string;
};

export function GeminiChat() {
  const [query, setQuery] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);

  const supportedVoice = useMemo(() => {
    if (typeof window === "undefined") {
      return false;
    }

    return Boolean((window as any).webkitSpeechRecognition || (window as any).SpeechRecognition);
  }, []);

  async function sendQuery(content: string) {
    const trimmed = content.trim();
    if (!trimmed) {
      return;
    }

    setLoading(true);
    setMessages((current) => [...current, { id: crypto.randomUUID(), role: "user", text: trimmed }]);

    try {
      const response = await fetch("/api/voice/tools", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ query: trimmed })
      });

      const result = (await response.json()) as VoiceToolResponse | { error: string };
      if (!response.ok || "error" in result) {
        throw new Error("error" in result ? result.error : "Assistant failed");
      }

      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text: `${result.message}\n\n(tool: ${result.toolName})`
        }
      ]);
      setQuery("");
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text: error instanceof Error ? error.message : "Assistant request failed"
        }
      ]);
    } finally {
      setLoading(false);
    }
  }

  function startVoice() {
    const SpeechCtor = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;

    if (!SpeechCtor) {
      window.alert("Voice recognition is not available in this browser.");
      return;
    }

    const recognition = new SpeechCtor();
    recognition.lang = "en-US";
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setQuery(transcript);
    };
    recognition.start();
  }

  return (
    <div className="stack">
      <div className="chat-messages">
        {messages.length === 0 && (
          <p className="muted">
            Ask: &quot;How are we doing today?&quot; or &quot;Who should I call right now?&quot;
          </p>
        )}
        {messages.map((message) => (
          <p key={message.id} className="chat-line">
            <span className="who">{message.role}</span>
            <br />
            {message.text}
          </p>
        ))}
      </div>
      <textarea
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Ask OutreachAI"
        style={{ minHeight: "96px" }}
      />
      <div style={{ display: "flex", gap: "0.5rem" }}>
        <button onClick={() => sendQuery(query)} disabled={loading}>
          {loading ? "Thinking..." : "Ask Assistant"}
        </button>
        <button className="ghost" type="button" onClick={startVoice} disabled={!supportedVoice || loading}>
          Voice Input
        </button>
      </div>
    </div>
  );
}
