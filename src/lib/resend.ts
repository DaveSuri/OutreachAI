import { Resend } from "resend";

let resendClient: Resend | null = null;

function getResendClient() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return null;
  }

  if (!resendClient) {
    resendClient = new Resend(apiKey);
  }

  return resendClient;
}

function isResendRestrictionError(message: string) {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("can only send") ||
    normalized.includes("testing emails") ||
    normalized.includes("verify a domain") ||
    normalized.includes("resend.com/domains") ||
    normalized.includes("sender identity")
  );
}

export async function sendResendEmail(args: {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
}) {
  const resend = getResendClient();
  if (!resend) {
    return {
      id: `mock_${Date.now()}`,
      status: "mocked" as const,
      notice: "Missing RESEND_API_KEY. Email was simulated."
    };
  }

  if (!process.env.EMAIL_FROM) {
    throw new Error("Missing EMAIL_FROM");
  }

  try {
    const { data, error } = await resend.emails.send({
      from: process.env.EMAIL_FROM,
      to: args.to,
      subject: args.subject,
      html: args.html,
      replyTo: args.replyTo
    });

    if (error) {
      if (isResendRestrictionError(error.message)) {
        return {
          id: `mock_${Date.now()}`,
          status: "mocked" as const,
          notice: "Resend account is in testing mode. Email was simulated."
        };
      }
      throw new Error(error.message);
    }

    return {
      id: data?.id ?? null,
      status: "sent" as const,
      notice: null
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (isResendRestrictionError(message)) {
      return {
        id: `mock_${Date.now()}`,
        status: "mocked" as const,
        notice: "Resend account is in testing mode. Email was simulated."
      };
    }
    throw error;
  }
}
