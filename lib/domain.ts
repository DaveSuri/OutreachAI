import { DraftStatus, LeadStatus, SequenceStepType } from "@prisma/client";

export const LEAD_TERMINAL_STATUSES: LeadStatus[] = [LeadStatus.REPLIED, LeadStatus.COMPLETED];

export const SUPPORTED_STEP_TYPES: SequenceStepType[] = [
  SequenceStepType.AI_RESEARCH,
  SequenceStepType.EMAIL,
  SequenceStepType.WAIT
];

export const PENDING_DRAFT_STATUS = DraftStatus.PENDING_APPROVAL;

export type LeadCSVRow = {
  email: string;
  firstName?: string;
  lastName?: string;
  company?: string;
};
