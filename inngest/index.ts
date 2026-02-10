import { campaignWorkflow } from "@/inngest/functions/campaign-workflow";
import { replyHandlingWorkflow } from "@/inngest/functions/reply-handling";
import { sendApprovedDraftWorkflow } from "@/inngest/functions/send-approved-draft";

export const functions = [campaignWorkflow, replyHandlingWorkflow, sendApprovedDraftWorkflow];
