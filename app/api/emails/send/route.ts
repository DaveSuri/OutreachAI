import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { generateColdEmail } from "@/lib/ai/openai";
import { sendEmail } from "@/lib/email/resend";

const sendDirectEmailSchema = z.object({
  leadId: z.string(),
  template: z.string().optional(),
  subject: z.string().optional(),
  body: z.string().optional(),
  useAI: z.boolean().default(false),
  demoMode: z.boolean().optional()
});

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { leadId, template, subject, body: customBody, useAI, demoMode } = sendDirectEmailSchema.parse(body);

    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      include: {
        campaign: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });

    if (!lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    let emailSubject = subject || "";
    let emailBody = customBody || "";

    // Use AI to generate email if requested
    if (useAI) {
      const generated = await generateColdEmail({
        firstName: lead.firstName,
        lastName: lead.lastName,
        company: lead.company,
        template: template || undefined
      });
      emailSubject = generated.subject;
      emailBody = generated.body;
    } else if (!customBody && template) {
      // Simple template substitution
      emailSubject = subject || "Quick idea";
      emailBody = template
        .replace(/{{firstName}}/g, lead.firstName || "")
        .replace(/{{lastName}}/g, lead.lastName || "")
        .replace(/{{company}}/g, lead.company || "");
    }

    if (!emailBody) {
      return NextResponse.json({ 
        error: "Please provide either a template, custom body, or enable AI generation" 
      }, { status: 400 });
    }

    let result: { id: string | null; status: "sent" | "mocked" };
    
    // Demo mode - simulate sending without actually calling Resend
    if (demoMode) {
      result = {
        id: `demo_${Date.now()}`,
        status: "mocked"
      };
    } else {
      // Send the email
      result = await sendEmail({
        to: lead.email,
        subject: emailSubject,
        html: emailBody.replace(/\n/g, "<br />")
      });
    }

    // Log the email
    await prisma.emailLog.create({
      data: {
        leadId,
        subject: emailSubject,
        body: emailBody,
        stepName: "DIRECT_SEND",
        status: result.status === "sent" ? "sent" : "bounced",
        messageId: result.id
      }
    });

    // Update lead
    await prisma.lead.update({
      where: { id: leadId },
      data: {
        lastEmailedAt: new Date(),
        messageId: result.id,
        status: "IN_SEQUENCE" as any
      }
    });

    return NextResponse.json({
      success: true,
      messageId: result.id,
      status: result.status,
      leadId,
      subject: emailSubject,
      demoMode: demoMode || result.status === "mocked"
    });

  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Send failed" },
      { status: 500 }
    );
  }
}
