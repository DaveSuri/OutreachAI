import { Resend } from "resend";

type SendEmailArgs = {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  headers?: Record<string, string>;
};

let resendClient: Resend | null = null;

function getResendClient(): Resend | null {
  if (!process.env.RESEND_API_KEY) {
    return null;
  }

  if (!resendClient) {
    resendClient = new Resend(process.env.RESEND_API_KEY);
  }

  return resendClient;
}

function htmlToPlainText(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

export async function sendEmail(args: SendEmailArgs): Promise<{ id: string | null; status: "sent" | "mocked" }> {
  const client = getResendClient();

  if (!client) {
    return {
      id: `mock_${Date.now()}`,
      status: "mocked"
    };
  }

  const from = process.env.EMAIL_FROM;
  if (!from) {
    throw new Error("Missing EMAIL_FROM environment variable");
  }

  const response = await client.emails.send({
    from,
    to: args.to,
    subject: args.subject,
    html: args.html,
    text: args.text || htmlToPlainText(args.html),
    replyTo: args.replyTo,
    headers: args.headers
  });

  if (response.error) {
    throw new Error(response.error.message);
  }

  return {
    id: response.data?.id || null,
    status: "sent"
  };
}
