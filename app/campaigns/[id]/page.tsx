import Link from "next/link";
import { notFound } from "next/navigation";
import { FileUp, Play, Send, Sparkles, Undo2, UserPlus } from "lucide-react";
import { addLead, generateDrafts, sendLeadEmailNow, simulateReply, startCampaign, uploadLeads } from "@/src/actions";
import { prisma } from "@/src/lib/db";
import { cn } from "@/src/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

export const dynamic = "force-dynamic";

function statusVariant(status: string): "default" | "success" | "warning" | "danger" | "slate" {
  if (status === "REPLIED") {
    return "success";
  }
  if (status === "SCHEDULED" || status === "DRAFTED") {
    return "warning";
  }
  if (status === "STOPPED" || status === "BOUNCED") {
    return "danger";
  }
  if (status === "PENDING") {
    return "slate";
  }
  return "default";
}

type CampaignPageProps = {
  params: {
    id: string;
  };
  searchParams?: {
    notice?: string;
    tone?: "success" | "warning" | "error";
  };
};

export default async function CampaignPage({ params, searchParams }: CampaignPageProps) {
  const campaign = await prisma.campaign.findUnique({
    where: { id: params.id },
    include: {
      leads: {
        orderBy: {
          createdAt: "desc"
        },
        include: {
          emailLogs: {
            orderBy: {
              sentAt: "desc"
            },
            take: 1
          }
        }
      }
    }
  });

  if (!campaign) {
    notFound();
  }

  const pendingCount = campaign.leads.filter((lead) => lead.status !== "REPLIED" && lead.status !== "BOUNCED").length;
  const draftedCount = campaign.leads.filter((lead) => lead.status === "DRAFTED").length;
  const notice = searchParams?.notice;
  const tone = searchParams?.tone ?? "success";

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 px-4 py-10 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-indigo-600">Campaign</p>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">{campaign.name}</h1>
        </div>
        <Link href="/" className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900">
          <Undo2 className="h-4 w-4" />
          Back to Dashboard
        </Link>
      </div>

      {notice && (
        <div
          className={cn(
            "rounded-xl border px-4 py-3 text-sm",
            tone === "success" && "border-emerald-200 bg-emerald-50 text-emerald-800",
            tone === "warning" && "border-amber-200 bg-amber-50 text-amber-900",
            tone === "error" && "border-rose-200 bg-rose-50 text-rose-800"
          )}
        >
          {notice}
        </div>
      )}

      <section className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Lead Ingestion</CardTitle>
            <CardDescription>Upload CSV via drag-and-drop or add a lead manually.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5 lg:grid-cols-2">
            <form action={uploadLeads} className="space-y-3 rounded-2xl border border-slate-200 p-4">
              <h3 className="font-semibold text-slate-900">CSV Upload</h3>
              <p className="text-sm text-slate-500">Headers: email, name, company</p>
              <input type="hidden" name="campaignId" value={campaign.id} />
              <Input name="file" type="file" accept=".csv,text/csv" required />
              <Button type="submit" className="w-full">
                <FileUp className="h-4 w-4" />
                Import Leads
              </Button>
            </form>

            <form action={addLead} className="space-y-3 rounded-2xl border border-slate-200 p-4">
              <h3 className="font-semibold text-slate-900">Add Lead</h3>
              <input type="hidden" name="campaignId" value={campaign.id} />
              <div>
                <Label htmlFor="email">Email</Label>
                <Input id="email" name="email" type="email" required />
              </div>
              <div>
                <Label htmlFor="name">Name</Label>
                <Input id="name" name="name" placeholder="Alex Carter" />
              </div>
              <div>
                <Label htmlFor="company">Company</Label>
                <Input id="company" name="company" placeholder="Northwind" />
              </div>
              <Button type="submit" className="w-full" variant="outline">
                <UserPlus className="h-4 w-4" />
                Save Lead
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Run Workflow</CardTitle>
            <CardDescription>Prepare AI drafts and launch durable campaign jobs.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
              <p>{pendingCount} pending leads</p>
              <p>{draftedCount} drafted leads</p>
            </div>

            <form action={generateDrafts} className="space-y-2">
              <input type="hidden" name="campaignId" value={campaign.id} />
              <Button type="submit" className="w-full" disabled={pendingCount === 0}>
                <Sparkles className="h-4 w-4" />
                {pendingCount === 0 ? "No Eligible Leads" : "Generate Drafts"}
              </Button>
              <p className="text-xs text-slate-500">Generates AI drafts for up to 5 leads in parallel batches.</p>
            </form>

            <form action={startCampaign} className="space-y-2">
              <input type="hidden" name="campaignId" value={campaign.id} />
              <div>
                <Label htmlFor="waitDuration">Wait between Email 1 and Email 2</Label>
                <Input id="waitDuration" name="waitDuration" defaultValue="2 days" placeholder="2 days" />
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" name="enableThinking" />
                Enable AI thinking between emails
              </label>
              <Textarea
                name="thinkingPrompt"
                placeholder="Optional: what should AI think about before follow-up? (e.g., product fit, pain points, timing)"
                className="min-h-16"
              />
              <Button type="submit" className="w-full" variant="secondary" disabled={draftedCount === 0}>
                <Play className="h-4 w-4" />
                {draftedCount === 0 ? "No Drafts to Start" : "Start Campaign"}
              </Button>
              <p className="text-xs text-slate-500">Runs durable Inngest workflow with safety lock check before follow-up send.</p>
            </form>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Leads</CardTitle>
          <CardDescription>
            Green = Replied. Amber = Waiting/Drafted. Use the Simulate Reply button to test race-condition safety.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Lead</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>AI Draft</TableHead>
                  <TableHead>Last Email</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {campaign.leads.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-slate-500">
                      No leads yet.
                    </TableCell>
                  </TableRow>
                )}

                {campaign.leads.map((lead) => (
                  <TableRow key={lead.id}>
                    <TableCell>
                      <p className="font-medium text-slate-900">{lead.name || "Unnamed Lead"}</p>
                      <p className="text-xs text-slate-500">{lead.email}</p>
                    </TableCell>
                    <TableCell>{lead.company || "-"}</TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(lead.status)}>{lead.status}</Badge>
                    </TableCell>
                    <TableCell className="max-w-sm">
                      {lead.aiDraft ? (
                        <Textarea value={lead.aiDraft} readOnly className="min-h-20 bg-slate-50 text-xs" />
                      ) : (
                        <span className="text-xs text-slate-400">Not generated</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-slate-500">{lead.emailLogs[0]?.sentAt?.toLocaleString() || "-"}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <form action={sendLeadEmailNow} className="inline-block">
                          <input type="hidden" name="leadId" value={lead.id} />
                          <Button type="submit" variant="secondary" size="sm">
                            <Send className="h-3 w-3" />
                            Send
                          </Button>
                        </form>
                        <form action={simulateReply} className="inline-block">
                          <input type="hidden" name="leadId" value={lead.id} />
                          <Button type="submit" variant="outline" size="sm" disabled={lead.status === "REPLIED"}>
                            {lead.status === "REPLIED" ? "Already Replied" : "Simulate Reply"}
                          </Button>
                        </form>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
