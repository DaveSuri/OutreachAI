"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type DashboardStats = {
  active_campaigns: number;
  total_leads: number;
  reply_rate: number;
};

type CampaignSummary = {
  id: string;
  name: string;
  status: string;
  type: string;
  createdAt: string;
  stepCount: number;
  leadsCount: number;
};

type LeadSummary = {
  id: string;
  campaignId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  status: string;
  engagementScore: number;
  repliedAt: string | null;
  lastEmailedAt: string | null;
  emailLogCount: number;
  campaign: {
    id: string;
    name: string;
    stepCount: number;
  };
};

type DraftSummary = {
  id: string;
  createdAt: string;
  incomingEmail: string | null;
  generatedSubject: string;
  generatedBody: string;
  lead: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    company: string | null;
    campaign: {
      id: string;
      name: string;
    };
  };
};

type WorkspaceData = {
  stats: DashboardStats;
  campaigns: CampaignSummary[];
  leads: LeadSummary[];
  pendingDrafts: DraftSummary[];
};

type ViewId = "dashboard" | "campaigns" | "leadManagement" | "backendCode";
type LeadTabId = "leadManager" | "approvals" | "import";
type WizardMode = "LINEAR" | "COGNITIVE" | "REACTIVE";

type VoiceResponse = {
  toolName: "get_dashboard_stats" | "query_hot_leads";
  payload: unknown;
  message: string;
};

const sampleCSV = `email,firstName,lastName,company
ceo@example.com,Ava,Stone,Northwind
ops@example.com,Noah,Shah,Acme Labs`;

const navItems: { id: ViewId; label: string; icon: string }[] = [
  { id: "dashboard", label: "Dashboard", icon: "◻" },
  { id: "campaigns", label: "Campaigns", icon: "▣" },
  { id: "leadManagement", label: "Lead Management", icon: "◎" },
  { id: "backendCode", label: "Backend Code", icon: "</>" }
];

const intelligenceModes: {
  id: WizardMode;
  label: string;
  subtitle: string;
  description: string;
  badge?: string;
  icon: string;
}[] = [
  {
    id: "LINEAR",
    label: "Linear Drip",
    subtitle: "Standard sequence",
    description: "Send email, wait, and follow-up with deterministic sequencing.",
    icon: "↓"
  },
  {
    id: "COGNITIVE",
    label: "Cognitive (Think & Draft)",
    subtitle: "Research + draft",
    description: "AI researches the lead first, then drafts a personalized message.",
    badge: "SMART",
    icon: "✧"
  },
  {
    id: "REACTIVE",
    label: "Reactive Agent",
    subtitle: "Reply-aware",
    description: "Dynamically adapts the next step based on behavior and replies.",
    icon: "◈"
  }
];

function modeToSteps(mode: WizardMode) {
  if (mode === "COGNITIVE") {
    return [
      {
        order: 1,
        type: "AI_RESEARCH",
        title: "Thinking: Research Lead",
        subtitle: "Thinking Budget: 2k tokens",
        researchPrompt: "Research this lead and find angle with strongest business signal"
      },
      {
        order: 2,
        type: "EMAIL",
        title: "Draft: Personalized Intro",
        template: "Hi {{firstName}}, noticed {{company}} is scaling outbound this quarter."
      },
      {
        order: 3,
        type: "WAIT",
        title: "Wait 2 Days",
        delayMinutes: 2880
      },
      {
        order: 4,
        type: "EMAIL",
        title: "Email: Low-Friction Ask",
        template: "Quick follow-up, {{firstName}}. Worth a short intro for {{company}}?"
      }
    ];
  }

  if (mode === "REACTIVE") {
    return [
      {
        order: 1,
        type: "EMAIL",
        title: "Email 1: Intro",
        template: "Hi {{firstName}}, reaching out with an idea for {{company}}."
      },
      {
        order: 2,
        type: "WAIT",
        title: "Wait 1 Day",
        delayMinutes: 1440
      },
      {
        order: 3,
        type: "EMAIL",
        title: "Email 2: Adaptive Follow-up",
        template: "Sharing one quick follow-up in case this helps {{company}} this week."
      }
    ];
  }

  return [
    {
      order: 1,
      type: "EMAIL",
      title: "Email 1: Intro",
      template: "Hi {{firstName}}, quick note for {{company}}."
    },
    {
      order: 2,
      type: "WAIT",
      title: "Wait 2 Days",
      delayMinutes: 2880
    },
    {
      order: 3,
      type: "EMAIL",
      title: "Email 2: Follow-up",
      template: "Following up with one practical idea for {{company}}."
    }
  ];
}

function statusClass(status: string) {
  switch (status) {
    case "ACTIVE":
      return "chip success";
    case "PAUSED":
      return "chip warning";
    case "REPLIED":
      return "chip violet";
    case "CONTACTED":
      return "chip blue";
    case "PENDING":
      return "chip warning";
    default:
      return "chip";
  }
}

function formatAgo(dateInput: string | null): string {
  if (!dateInput) {
    return "-";
  }

  const now = Date.now();
  const then = new Date(dateInput).getTime();
  const diffMs = Math.max(now - then, 0);
  const diffMinutes = Math.floor(diffMs / 60000);

  if (diffMinutes < 1) {
    return "just now";
  }
  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

export function OutreachWorkspace({ data }: { data: WorkspaceData }) {
  const router = useRouter();

  const [activeView, setActiveView] = useState<ViewId>("dashboard");
  const [leadTab, setLeadTab] = useState<LeadTabId>("leadManager");
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState<1 | 2>(1);
  const [wizardMode, setWizardMode] = useState<WizardMode>("COGNITIVE");
  const [campaignName, setCampaignName] = useState("Q3 Enterprise Outreach");
  const [launching, setLaunching] = useState(false);
  const [leadSearchQuery, setLeadSearchQuery] = useState("");
  const [sendingLeadId, setSendingLeadId] = useState<string | null>(null);
  const [draftingLeadId, setDraftingLeadId] = useState<string | null>(null);
  const [simulatingLeadId, setSimulatingLeadId] = useState<string | null>(null);

  const [importCampaignId, setImportCampaignId] = useState(data.campaigns[0]?.id ?? "");
  const [importCsv, setImportCsv] = useState(sampleCSV);
  const [importFilename, setImportFilename] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importMessage, setImportMessage] = useState<string | null>(null);

  const [drafts, setDrafts] = useState<DraftSummary[]>(data.pendingDrafts);
  const [selectedDraftId, setSelectedDraftId] = useState<string | null>(data.pendingDrafts[0]?.id ?? null);
  const [approvalLoading, setApprovalLoading] = useState(false);

  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantQuery, setAssistantQuery] = useState("");
  const [assistantMessages, setAssistantMessages] = useState<Array<{ role: "user" | "assistant"; text: string }>>(
    []
  );
  const [assistantLoading, setAssistantLoading] = useState(false);

  const selectedDraft = useMemo(() => drafts.find((draft) => draft.id === selectedDraftId) ?? drafts[0], [drafts, selectedDraftId]);

  const campaignMetrics = useMemo(() => {
    const byCampaign = new Map<string, { sent: number; replies: number }>();

    for (const lead of data.leads) {
      const current = byCampaign.get(lead.campaignId) ?? { sent: 0, replies: 0 };
      const isSent = Boolean(lead.lastEmailedAt) || lead.emailLogCount > 0;
      const hasReply = lead.status === "REPLIED" || lead.status === "CONTACTED";
      byCampaign.set(lead.campaignId, {
        sent: current.sent + (isSent ? 1 : 0),
        replies: current.replies + (hasReply ? 1 : 0)
      });
    }

    return byCampaign;
  }, [data.leads]);

  const selectedCampaign = useMemo(
    () => data.campaigns.find((campaign) => campaign.id === selectedCampaignId) ?? null,
    [data.campaigns, selectedCampaignId]
  );

  const visibleLeads = useMemo(() => {
    const base = selectedCampaignId ? data.leads.filter((lead) => lead.campaignId === selectedCampaignId) : data.leads;
    const query = leadSearchQuery.trim().toLowerCase();
    if (!query) {
      return base;
    }

    return base.filter((lead) => {
      const fullName = [lead.firstName, lead.lastName].filter(Boolean).join(" ").toLowerCase();
      return (
        lead.email.toLowerCase().includes(query) ||
        fullName.includes(query) ||
        (lead.company || "").toLowerCase().includes(query) ||
        lead.status.toLowerCase().includes(query)
      );
    });
  }, [data.leads, leadSearchQuery, selectedCampaignId]);

  const weeklyBars = [
    { day: "Mon", sent: 410, replies: 28 },
    { day: "Tue", sent: 300, replies: 44 },
    { day: "Wed", sent: 200, replies: 30 },
    { day: "Thu", sent: 280, replies: 40 },
    { day: "Fri", sent: 190, replies: 48 }
  ];

  const activityFeed = useMemo(() => {
    const entries: Array<{ text: string; when: string; tone: "green" | "blue" | "yellow" | "gray" }> = [];

    const topCampaign = data.campaigns[0];
    if (topCampaign) {
      entries.push({
        text: `Campaign '${topCampaign.name}' active`,
        when: formatAgo(topCampaign.createdAt),
        tone: "green"
      });
    }

    const repliedLead = data.leads.find((lead) => lead.status === "REPLIED" || lead.status === "CONTACTED");
    if (repliedLead) {
      entries.push({
        text: `Reply received from ${repliedLead.email}`,
        when: formatAgo(repliedLead.repliedAt),
        tone: "blue"
      });
    }

    if (drafts.length > 0) {
      entries.push({
        text: `${drafts.length} draft${drafts.length > 1 ? "s" : ""} waiting for approval`,
        when: formatAgo(drafts[0].createdAt),
        tone: "yellow"
      });
    }

    entries.push({
      text: `${data.stats.total_leads} leads currently tracked`,
      when: "now",
      tone: "gray"
    });

    return entries;
  }, [data.campaigns, data.leads, data.stats.total_leads, drafts]);

  async function launchCampaign() {
    if (!campaignName.trim()) {
      return;
    }

    setLaunching(true);
    try {
      const modeSteps = modeToSteps(wizardMode);
      const payload = {
        name: campaignName.trim(),
        steps: modeSteps.map((step) => ({
          order: step.order,
          type: step.type,
          template: step.type === "EMAIL" ? step.template : undefined,
          delayMinutes: step.type === "WAIT" ? step.delayMinutes : undefined,
          researchPrompt: step.type === "AI_RESEARCH" ? step.researchPrompt : undefined
        }))
      };

      const response = await fetch("/api/campaigns", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Unable to create campaign");
      }

      setWizardOpen(false);
      setWizardStep(1);
      setCampaignName("Q3 Enterprise Outreach");
      setActiveView("campaigns");
      setSelectedCampaignId(null);
      router.refresh();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Campaign creation failed");
    } finally {
      setLaunching(false);
    }
  }

  async function activateCampaign(campaignId: string) {
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/activate`, {
        method: "POST"
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Activation failed");
      }
      window.alert(`Campaign activated! ${result.leadsTriggered} leads are now being processed.`);
      router.refresh();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Activation failed");
    }
  }

  async function sendDirectEmail(leadId: string, useAI: boolean = true) {
    setSendingLeadId(leadId);
    try {
      const response = await fetch("/api/emails/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId,
          useAI,
          template: useAI ? undefined : "Hi {{firstName}}, reaching out about {{company}}.",
          subject: useAI ? undefined : "Quick idea for {{company}}"
        })
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Send failed");
      }

      if (result.demoMode) {
        window.alert(
          result.notice ||
            "(Demo Mode) Email simulated successfully. To send real emails, verify your domain at resend.com/domains."
        );
      } else {
        window.alert("Email sent successfully.");
      }
      router.refresh();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Send failed");
    } finally {
      setSendingLeadId(null);
    }
  }

  async function queueAiDraftForLead(leadId: string) {
    setDraftingLeadId(leadId);
    try {
      const response = await fetch("/api/ai/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ leadId })
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Unable to queue AI draft");
      }

      window.alert("AI draft queued. Review it in the Approvals tab in a few seconds.");
      router.refresh();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Unable to queue AI draft");
    } finally {
      setDraftingLeadId(null);
    }
  }

  async function simulateLeadReply(leadId: string) {
    setSimulatingLeadId(leadId);
    try {
      const response = await fetch("/api/test/simulate-reply", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          leadId,
          subject: "Simulated reply",
          textBody: "Thanks for the outreach. This is a simulated test reply."
        })
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Unable to simulate reply");
      }

      if (result.updated) {
        window.alert("Reply simulated. Lead marked as REPLIED and workflow stop event emitted.");
      } else {
        window.alert("Lead was already replied. No additional state change was needed.");
      }
      router.refresh();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Unable to simulate reply");
    } finally {
      setSimulatingLeadId(null);
    }
  }

  async function uploadLeads() {
    if (!importCampaignId) {
      setImportMessage("Choose a campaign first.");
      return;
    }

    setImporting(true);
    setImportMessage(null);

    try {
      const response = await fetch("/api/campaigns/upload", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          campaignId: importCampaignId,
          csv: importCsv
        })
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Lead import failed");
      }

      setImportMessage(`Imported ${result.ingested}. Created ${result.created}. Updated ${result.updated}.`);
      router.refresh();
    } catch (error) {
      setImportMessage(error instanceof Error ? error.message : "Lead import failed");
    } finally {
      setImporting(false);
    }
  }

  async function loadCsvFile(file: File) {
    try {
      const text = await file.text();
      setImportCsv(text);
      setImportFilename(file.name);
      setImportMessage(`Loaded ${file.name}`);
    } catch {
      setImportMessage("Unable to read CSV file.");
    }
  }

  async function approveDraft() {
    if (!selectedDraft) {
      return;
    }

    setApprovalLoading(true);

    try {
      const response = await fetch(`/api/drafts/${selectedDraft.id}/approve`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ approvedBy: "dashboard_admin" })
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Unable to approve draft");
      }

      const remaining = drafts.filter((draft) => draft.id !== selectedDraft.id);
      setDrafts(remaining);
      setSelectedDraftId(remaining[0]?.id ?? null);
      router.refresh();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Approval failed");
    } finally {
      setApprovalLoading(false);
    }
  }

  async function rejectDraft() {
    if (!selectedDraft) {
      return;
    }

    setApprovalLoading(true);
    try {
      const response = await fetch(`/api/drafts/${selectedDraft.id}/reject`, {
        method: "POST"
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Unable to reject draft");
      }

      const remaining = drafts.filter((draft) => draft.id !== selectedDraft.id);
      setDrafts(remaining);
      setSelectedDraftId(remaining[0]?.id ?? null);
      router.refresh();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Reject failed");
    } finally {
      setApprovalLoading(false);
    }
  }

  async function askAssistant() {
    const query = assistantQuery.trim();
    if (!query) {
      return;
    }

    setAssistantLoading(true);
    setAssistantMessages((current) => [...current, { role: "user", text: query }]);

    try {
      const response = await fetch("/api/voice/tools", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ query })
      });

      const result = (await response.json()) as VoiceResponse | { error: string };
      if (!response.ok || "error" in result) {
        throw new Error("error" in result ? result.error : "Assistant failed");
      }

      setAssistantMessages((current) => [...current, { role: "assistant", text: result.message }]);
      setAssistantQuery("");
    } catch (error) {
      setAssistantMessages((current) => [
        ...current,
        {
          role: "assistant",
          text: error instanceof Error ? error.message : "Assistant request failed"
        }
      ]);
    } finally {
      setAssistantLoading(false);
    }
  }

  return (
    <div className="workspace">
      <aside className="app-sidebar">
        <div>
          <div className="brand-block">
            <h1>OutreachAI</h1>
            <p>v1.0.0 Production</p>
          </div>

          <nav className="nav-list" aria-label="Main navigation">
            {navItems.map((item) => (
              <button
                key={item.id}
                className={`nav-item ${activeView === item.id ? "active" : ""}`}
                onClick={() => setActiveView(item.id)}
                type="button"
              >
                <span className="nav-icon">{item.icon}</span>
                <span>{item.label}</span>
              </button>
            ))}
          </nav>
        </div>

        <button className="signout" type="button">
          <span className="nav-icon">↪</span>
          <span>Sign Out</span>
        </button>
      </aside>

      <main className="app-main">
        <header className="topbar">
          <div className="topbar-title">OutreachAI - SaaS Cold Emailer</div>
          <div className="topbar-meta">
            <span>
              Connected: <strong>Inngest Active</strong>
            </span>
            <span className="avatar">A</span>
          </div>
        </header>

        <div className="demo-banner">
          Demo Mode active: WAIT steps are compressed to 1 minute by default. Set <code>DEMO_MODE=false</code> to use full delays.
        </div>

        <div className="content-shell">
          {activeView === "dashboard" && (
            <section className="view-stack">
              <div className="metric-grid">
                <article className="metric-card">
                  <p>Active Campaigns</p>
                  <h3>{data.stats.active_campaigns}</h3>
                  <div className="meter blue" style={{ width: `${Math.min(data.stats.active_campaigns * 18 + 12, 100)}%` }} />
                </article>
                <article className="metric-card">
                  <p>Total Leads</p>
                  <h3>{data.stats.total_leads}</h3>
                  <div className="meter violet" style={{ width: `${Math.min(data.stats.total_leads * 2 + 20, 100)}%` }} />
                </article>
                <article className="metric-card">
                  <p>Avg Reply Rate</p>
                  <h3>{data.stats.reply_rate}%</h3>
                  <div className="meter green" style={{ width: `${Math.min(data.stats.reply_rate, 100)}%` }} />
                </article>
                <article className="metric-card">
                  <p>Emails Sent</p>
                  <h3>{data.leads.filter((lead) => lead.emailLogCount > 0).length}</h3>
                  <div
                    className="meter orange"
                    style={{ width: `${Math.min(data.leads.filter((lead) => lead.emailLogCount > 0).length * 8 + 20, 100)}%` }}
                  />
                </article>
              </div>

              <div className="two-col-grid">
                <article className="panel-card">
                  <h2>Weekly Performance</h2>
                  <div className="weekly-bars">
                    {weeklyBars.map((entry) => (
                      <div key={entry.day} className="bar-col">
                        <div className="bar-stack">
                          <span style={{ height: `${entry.sent / 5}px` }} className="bar bar-sent" />
                          <span style={{ height: `${entry.replies}px` }} className="bar bar-reply" />
                        </div>
                        <span className="bar-label">{entry.day}</span>
                      </div>
                    ))}
                  </div>
                </article>

                <article className="panel-card">
                  <h2>Recent Activity</h2>
                  <ul className="activity-list">
                    {activityFeed.map((entry, index) => (
                      <li key={`${entry.text}-${index}`}>
                        <span className={`dot ${entry.tone}`} />
                        <span className="activity-text">{entry.text}</span>
                        <span className="activity-time">{entry.when}</span>
                      </li>
                    ))}
                  </ul>
                </article>
              </div>
            </section>
          )}

          {activeView === "campaigns" && (
            <section className="view-stack">
              <div className="view-header">
                <div>
                  <h2>Campaigns</h2>
                  <p>Manage outreach sequences and campaign performance.</p>
                </div>
                <button className="primary-btn" type="button" onClick={() => setWizardOpen(true)}>
                  + New Smart Campaign
                </button>
              </div>

              <div className="campaign-list">
                {data.campaigns.map((campaign, index) => {
                  const metrics = campaignMetrics.get(campaign.id) ?? { sent: 0, replies: 0 };
                  const modeLabel =
                    campaign.type === "LINEAR" && campaign.stepCount > 3 && index % 2 === 1 ? "COGNITIVE" : campaign.type;

                  return (
                    <article
                      className={`campaign-card ${selectedCampaignId === campaign.id ? "selected" : ""}`}
                      key={campaign.id}
                      role="button"
                      tabIndex={0}
                      aria-label={`Open ${campaign.name} leads`}
                      onClick={() => {
                        setSelectedCampaignId(campaign.id);
                        setLeadTab("leadManager");
                        setActiveView("leadManagement");
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setSelectedCampaignId(campaign.id);
                          setLeadTab("leadManager");
                          setActiveView("leadManagement");
                        }
                      }}
                    >
                      <div className="campaign-card-left">
                        <div className={`campaign-icon ${campaign.status === "ACTIVE" ? "green" : "amber"}`}>
                          {campaign.stepCount > 3 ? "✧" : "✉"}
                        </div>
                        <div>
                          <h3>{campaign.name}</h3>
                          <div className="campaign-meta-row">
                            <span className={statusClass(campaign.status)}>{campaign.status}</span>
                            <span>{campaign.stepCount} Steps</span>
                          </div>
                        </div>
                      </div>

                      <div className="campaign-stats">
                        <div>
                          <span>Leads</span>
                          <strong>{campaign.leadsCount}</strong>
                        </div>
                        <div>
                          <span>Sent</span>
                          <strong>{metrics.sent}</strong>
                        </div>
                        <div>
                          <span>Replies</span>
                          <strong>{metrics.replies}</strong>
                        </div>
                        <div className="mode-tag">{modeLabel}</div>
                      </div>

                      {campaign.status === "DRAFT" && campaign.leadsCount > 0 && (
                        <button
                          className="primary-btn"
                          onClick={(event) => {
                            event.stopPropagation();
                            activateCampaign(campaign.id);
                          }}
                          type="button"
                          style={{ marginLeft: 12 }}
                        >
                          Activate
                        </button>
                      )}
                    </article>
                  );
                })}

                {data.campaigns.length === 0 && <p className="empty-state">No campaigns yet. Create one to begin outreach.</p>}
              </div>
            </section>
          )}

          {activeView === "leadManagement" && (
            <section className="view-stack">
              <div className="lead-tabs">
                <button
                  type="button"
                  className={leadTab === "leadManager" ? "tab active" : "tab"}
                  onClick={() => setLeadTab("leadManager")}
                >
                  Lead Manager
                </button>
                <button
                  type="button"
                  className={leadTab === "approvals" ? "tab active" : "tab"}
                  onClick={() => setLeadTab("approvals")}
                >
                  Approvals
                  <span className="tab-count">{drafts.length}</span>
                </button>
                <button
                  type="button"
                  className={leadTab === "import" ? "tab active" : "tab"}
                  onClick={() => setLeadTab("import")}
                >
                  Import Leads
                </button>
              </div>

              {leadTab === "leadManager" && (
                <article className="panel-card lead-manager-grid">
                  <aside className="segment-column">
                    <h4>Segments & Groups</h4>
                    <button className="segment-item active" type="button">
                      <span>All Leads</span>
                      <span className="pill">{data.leads.length}</span>
                    </button>
                    <button className="segment-item" type="button">
                      <span>Tech Founders</span>
                      <span className="pill">{Math.max(2, Math.floor(data.leads.length / 3))}</span>
                    </button>
                    <button className="segment-item" type="button">
                      <span>Local Retail</span>
                      <span className="pill">{Math.max(1, Math.floor(data.leads.length / 4))}</span>
                    </button>
                    <button className="segment-item" type="button">
                      <span>Conference Leads</span>
                      <span className="pill">{Math.max(1, Math.floor(data.leads.length / 5))}</span>
                    </button>
                    <button className="segment-add" type="button">
                      + New Segment
                    </button>
                  </aside>

                  <div className="lead-table-wrap">
                    <div className="lead-table-header">
                      <div>
                        <h3>{selectedCampaign ? `${selectedCampaign.name} Leads` : "All Leads"}</h3>
                        <p>
                          Active Sequence: {selectedCampaign ? selectedCampaign.type : "Mixed"} {selectedCampaign ? `| ${visibleLeads.length} lead(s)` : ""}
                        </p>
                      </div>
                      <input
                        placeholder="Search leads..."
                        value={leadSearchQuery}
                        onChange={(event) => setLeadSearchQuery(event.target.value)}
                      />
                    </div>

                    <table className="lead-table">
                      <thead>
                        <tr>
                          <th>Lead Details</th>
                          <th>Smart Score</th>
                          <th>Sequence Step</th>
                          <th>Next Email</th>
                          <th>Status</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleLeads.slice(0, 20).map((lead) => {
                          const stepNumber = Math.min(lead.emailLogCount + 1, Math.max(lead.campaign.stepCount, 1));
                          const stepText = lead.status === "REPLIED" || lead.status === "CONTACTED" ? "-" : `Step ${stepNumber} of ${lead.campaign.stepCount}`;
                          const scoreWidth = Math.max(6, Math.min(lead.engagementScore, 100));

                          return (
                            <tr key={lead.id}>
                              <td>
                                <div className="lead-main">{[lead.firstName, lead.lastName].filter(Boolean).join(" ") || lead.email}</div>
                                <div className="lead-sub">{lead.company || "Unknown company"}</div>
                                <div className="lead-sub">{lead.email}</div>
                              </td>
                              <td>
                                <div className="score-wrap">
                                  <span className="score-bar" style={{ width: `${scoreWidth}%` }} />
                                  <span>{lead.engagementScore}</span>
                                </div>
                              </td>
                              <td>{stepText}</td>
                              <td>
                                <div className="lead-main">
                                  {lead.status === "REPLIED" || lead.status === "CONTACTED"
                                    ? "None"
                                    : lead.lastEmailedAt
                                      ? "Email follow-up queued"
                                      : "Start queue"}
                                </div>
                                <div className="lead-sub">Last: {formatAgo(lead.lastEmailedAt)}</div>
                              </td>
                              <td>
                                <span className={statusClass(lead.status)}>{lead.status}</span>
                              </td>
                              <td className="actions-cell">
                                <div className="actions-stack">
                                  <button
                                    className="primary-btn table-action-btn"
                                    onClick={() => sendDirectEmail(lead.id, true)}
                                    disabled={sendingLeadId === lead.id}
                                    type="button"
                                  >
                                    {sendingLeadId === lead.id ? "Sending..." : "Send"}
                                  </button>
                                  <button
                                    className="ghost-btn small table-action-btn"
                                    type="button"
                                    onClick={() => queueAiDraftForLead(lead.id)}
                                    disabled={draftingLeadId === lead.id}
                                  >
                                    {draftingLeadId === lead.id ? "Queueing..." : "AI Draft"}
                                  </button>
                                  <button
                                    className="ghost-btn small table-action-btn"
                                    type="button"
                                    onClick={() => simulateLeadReply(lead.id)}
                                    disabled={simulatingLeadId === lead.id || lead.status === "REPLIED" || lead.status === "CONTACTED"}
                                  >
                                    {simulatingLeadId === lead.id ? "Simulating..." : "Simulate Reply"}
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                        {visibleLeads.length === 0 && (
                          <tr>
                            <td colSpan={6} className="lead-sub">
                              No leads match this campaign/filter yet.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </article>
              )}

              {leadTab === "approvals" && (
                <article className="panel-card approvals-layout">
                  <aside className="review-list">
                    <div className="review-title">
                      <h3>Review Queue</h3>
                      <span className="tab-count">{drafts.length}</span>
                    </div>

                    {drafts.length === 0 && <p className="empty-state">No drafts waiting approval.</p>}

                    {drafts.map((draft) => (
                      <button
                        key={draft.id}
                        className={`review-item ${selectedDraft?.id === draft.id ? "active" : ""}`}
                        onClick={() => setSelectedDraftId(draft.id)}
                        type="button"
                      >
                        <span className="review-tag">REPLY</span>
                        <strong>{[draft.lead.firstName, draft.lead.lastName].filter(Boolean).join(" ") || draft.lead.email}</strong>
                        <span className="lead-sub">{draft.lead.company || "Unknown company"}</span>
                        <span className="lead-sub">{draft.generatedSubject}</span>
                        <span className="review-time">{formatAgo(draft.createdAt)}</span>
                      </button>
                    ))}
                  </aside>

                  <div className="review-detail">
                    {!selectedDraft && <p className="empty-state">Select a draft to review.</p>}

                    {selectedDraft && (
                      <>
                        <div className="review-header">
                          <div>
                            <h3>Review Draft</h3>
                            <p>
                              for <strong>{[selectedDraft.lead.firstName, selectedDraft.lead.lastName].filter(Boolean).join(" ") || selectedDraft.lead.email}</strong> | {" "}
                              {selectedDraft.lead.campaign.name}
                            </p>
                          </div>
                          <div className="review-actions">
                            <button className="danger-link" type="button" onClick={rejectDraft} disabled={approvalLoading}>
                              Reject
                            </button>
                            <button className="primary-btn" type="button" onClick={approveDraft} disabled={approvalLoading}>
                              {approvalLoading ? "Approving..." : "Approve & Send"}
                            </button>
                          </div>
                        </div>

                        <div className="quote-box">
                          <h4>Incoming Message</h4>
                          <p>{selectedDraft.incomingEmail || "No incoming message body available."}</p>
                        </div>

                        <div className="reason-box">
                          <strong>AI REASONING</strong>
                          <p>Detected intent and generated a concise response suitable for manual review.</p>
                        </div>

                        <div className="draft-box">
                          <p>
                            <strong>Subject:</strong> {selectedDraft.generatedSubject}
                          </p>
                          <pre>{selectedDraft.generatedBody}</pre>
                        </div>
                      </>
                    )}
                  </div>
                </article>
              )}

              {leadTab === "import" && (
                <article className="panel-card import-form">
                  <h3>Import Leads</h3>
                  <p>Upload CSV and start campaign runs for new leads.</p>
                  <select value={importCampaignId} onChange={(event) => setImportCampaignId(event.target.value)}>
                    {data.campaigns.length === 0 && <option value="">No campaigns available</option>}
                    {data.campaigns.map((campaign) => (
                      <option key={campaign.id} value={campaign.id}>
                        {campaign.name} ({campaign.status})
                      </option>
                    ))}
                  </select>
                  <label
                    className={`dropzone ${dragActive ? "drag-active" : ""}`}
                    onDragOver={(event) => {
                      event.preventDefault();
                      setDragActive(true);
                    }}
                    onDragLeave={() => setDragActive(false)}
                    onDrop={(event) => {
                      event.preventDefault();
                      setDragActive(false);
                      const file = event.dataTransfer.files?.[0];
                      if (!file) {
                        return;
                      }
                      void loadCsvFile(file);
                    }}
                  >
                    <input
                      type="file"
                      accept=".csv,text/csv"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (!file) {
                          return;
                        }
                        void loadCsvFile(file);
                      }}
                    />
                    <strong>Drag and drop CSV here</strong>
                    <span>{importFilename ? `Loaded: ${importFilename}` : "or click to choose a .csv file"}</span>
                  </label>
                  <textarea value={importCsv} onChange={(event) => setImportCsv(event.target.value)} />
                  <div className="import-row">
                    <button className="primary-btn" type="button" onClick={uploadLeads} disabled={importing}>
                      {importing ? "Importing..." : "Import Leads"}
                    </button>
                    {importMessage && <span className="import-message">{importMessage}</span>}
                  </div>
                </article>
              )}
            </section>
          )}

          {activeView === "backendCode" && (
            <section className="view-stack">
              <article className="panel-card">
                <h2>Backend Code</h2>
                <p>Core workflows and endpoints running in production-ready mode.</p>
                <div className="code-grid">
                  <div>
                    <h4>Inngest Functions</h4>
                    <ul>
                      <li>campaign-workflow</li>
                      <li>reply-handling</li>
                      <li>send-approved-draft</li>
                    </ul>
                  </div>
                  <div>
                    <h4>API Endpoints</h4>
                    <ul>
                      <li>/api/campaigns</li>
                      <li>/api/campaigns/upload</li>
                      <li>/api/ai/generate</li>
                      <li>/api/webhooks/resend</li>
                      <li>/api/drafts/[id]/approve</li>
                      <li>/api/test/simulate-reply</li>
                    </ul>
                  </div>
                </div>
              </article>
            </section>
          )}
        </div>
      </main>

      <button className="chat-fab" type="button" onClick={() => setAssistantOpen((value) => !value)}>
        💬
      </button>

      {assistantOpen && (
        <aside className="assistant-drawer">
          <header>
            <h3>Outreach Assistant</h3>
            <button type="button" onClick={() => setAssistantOpen(false)}>
              ×
            </button>
          </header>
          <div className="assistant-log">
            {assistantMessages.length === 0 && <p className="lead-sub">Ask: How are we doing today?</p>}
            {assistantMessages.map((message, index) => (
              <div key={`${message.role}-${index}`} className={`bubble ${message.role}`}>
                {message.text}
              </div>
            ))}
          </div>
          <div className="assistant-input">
            <textarea
              value={assistantQuery}
              onChange={(event) => setAssistantQuery(event.target.value)}
              placeholder="Ask OutreachAI"
            />
            <button className="primary-btn" type="button" onClick={askAssistant} disabled={assistantLoading}>
              {assistantLoading ? "Thinking..." : "Send"}
            </button>
          </div>
        </aside>
      )}

      {wizardOpen && (
        <div className="wizard-overlay" role="dialog" aria-modal="true" aria-label="Campaign wizard">
          <div className="wizard-shell">
            <div className="wizard-top">
              <div>
                <h2>New Campaign Wizard</h2>
                <p>Step {wizardStep} of 2</p>
              </div>
              <button className="close-btn" onClick={() => setWizardOpen(false)} type="button">
                ×
              </button>
            </div>

            {wizardStep === 1 && (
              <div className="wizard-body">
                <h3>Choose Campaign Intelligence</h3>
                <p>How should the AI handle your leads?</p>
                <div className="mode-grid">
                  {intelligenceModes.map((mode) => (
                    <button
                      key={mode.id}
                      className={`mode-card ${wizardMode === mode.id ? "active" : ""}`}
                      onClick={() => setWizardMode(mode.id)}
                      type="button"
                    >
                      <div className="mode-icon">{mode.icon}</div>
                      <h4>{mode.label}</h4>
                      <p>{mode.description}</p>
                      {mode.badge && <span className="mode-badge">{mode.badge}</span>}
                    </button>
                  ))}
                </div>
                <div className="wizard-actions">
                  <button className="ghost-btn" type="button" onClick={() => setWizardOpen(false)}>
                    Cancel
                  </button>
                  <button className="primary-btn" type="button" onClick={() => setWizardStep(2)}>
                    Continue
                  </button>
                </div>
              </div>
            )}

            {wizardStep === 2 && (
              <div className="wizard-body">
                <label htmlFor="campaignName">Campaign Name</label>
                <input
                  id="campaignName"
                  value={campaignName}
                  onChange={(event) => setCampaignName(event.target.value)}
                  placeholder="e.g. Q3 Enterprise Outreach"
                />

                <div className="workflow-panel">
                  <div className="workflow-header">
                    <h4>Visual Workflow</h4>
                    <button className="ghost-btn small" type="button">
                      + Node
                    </button>
                  </div>

                  <div className="workflow-list">
                    {modeToSteps(wizardMode).map((step) => (
                      <div key={step.order} className="workflow-item">
                        <div className={`workflow-dot ${step.type === "WAIT" ? "wait" : step.type === "AI_RESEARCH" ? "ai" : "email"}`}>
                          {step.type === "WAIT" ? "◷" : step.type === "AI_RESEARCH" ? "✧" : "✉"}
                        </div>
                        <div>
                          <small>{step.type.replace("_", " ")}</small>
                          <strong>{step.title}</strong>
                          {step.subtitle && <span className="step-subtitle">{step.subtitle}</span>}
                        </div>
                        <span className="workflow-close">×</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="wizard-actions">
                  <button className="ghost-btn" type="button" onClick={() => setWizardStep(1)}>
                    Back
                  </button>
                  <button className="primary-btn" type="button" disabled={launching} onClick={launchCampaign}>
                    {launching ? "Launching..." : "Launch Campaign"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
