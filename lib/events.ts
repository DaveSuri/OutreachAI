export const events = {
  campaignStart: "campaign/start",
  leadReplyReceived: "lead/reply.received",
  draftApproved: "draft/approved"
} as const;

export type CampaignStartEventData = {
  campaignId: string;
  leadId: string;
};

export type LeadReplyReceivedEventData = {
  leadId: string;
  campaignId: string;
  fromEmail: string;
  subject?: string;
  textBody: string;
  messageId?: string;
};

export type DraftApprovedEventData = {
  draftId: string;
  approvedBy: string;
};
