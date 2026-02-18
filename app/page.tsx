import Link from "next/link";
import { ArrowRight, BarChart3, FolderKanban, Plus, Users } from "lucide-react";
import { createCampaign } from "@/src/actions";
import { prisma } from "@/src/lib/db";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [campaigns, leadCount, repliedCount] = await Promise.all([
    prisma.campaign.findMany({
      orderBy: {
        createdAt: "desc"
      },
      include: {
        _count: {
          select: {
            leads: true
          }
        }
      }
    }),
    prisma.lead.count(),
    prisma.lead.count({
      where: {
        status: "REPLIED"
      }
    })
  ]);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 px-4 py-10 sm:px-6 lg:px-8">
      <header className="rounded-3xl border border-slate-200 bg-gradient-to-br from-indigo-50 via-white to-cyan-50 p-8">
        <p className="text-sm font-semibold uppercase tracking-widest text-indigo-600">Outreach AI</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">Automated Outreach Control Center</h1>
        <p className="mt-3 max-w-3xl text-slate-600">
          Launch event-driven campaigns, generate AI drafts, and safely stop follow-ups when leads reply.
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardDescription>Total Campaigns</CardDescription>
            <FolderKanban className="h-4 w-4 text-indigo-500" />
          </CardHeader>
          <CardContent>
            <CardTitle className="text-3xl">{campaigns.length}</CardTitle>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardDescription>Total Leads</CardDescription>
            <Users className="h-4 w-4 text-indigo-500" />
          </CardHeader>
          <CardContent>
            <CardTitle className="text-3xl">{leadCount}</CardTitle>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardDescription>Replies</CardDescription>
            <BarChart3 className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <CardTitle className="text-3xl">{repliedCount}</CardTitle>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.1fr,2fr]">
        <Card>
          <CardHeader>
            <CardTitle>New Campaign</CardTitle>
            <CardDescription>Create a campaign and start adding leads.</CardDescription>
          </CardHeader>
          <CardContent>
            <form action={createCampaign} className="space-y-3">
              <div>
                <Input name="name" placeholder="Q2 Product Marketing Outreach" required />
              </div>
              <input type="hidden" name="userId" value="demo-user" />
              <Button type="submit" className="w-full">
                <Plus className="h-4 w-4" />
                Create Campaign
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Campaigns</CardTitle>
            <CardDescription>Open a campaign to import leads, draft emails, and run workflows.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {campaigns.length === 0 && <p className="text-sm text-slate-500">No campaigns yet.</p>}

            {campaigns.map((campaign) => (
              <Link
                key={campaign.id}
                href={`/campaigns/${campaign.id}`}
                className="flex items-center justify-between rounded-2xl border border-slate-200 p-4 transition hover:border-indigo-300 hover:bg-indigo-50/40"
              >
                <div className="space-y-2">
                  <h3 className="font-semibold text-slate-900">{campaign.name}</h3>
                  <div className="flex items-center gap-2 text-sm text-slate-500">
                    <Badge variant={campaign.status === "ACTIVE" ? "success" : "slate"}>{campaign.status}</Badge>
                    <span>{campaign._count.leads} leads</span>
                  </div>
                </div>

                <Button variant="ghost" size="sm" className="text-indigo-600">
                  Open
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            ))}
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
