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

export async function sendResendEmail(args: {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
}) {
  const resend = getResendClient();
  if (!resend) {
    throw new Error("Missing RESEND_API_KEY");
  }

  if (!process.env.EMAIL_FROM) {
    throw new Error("Missing EMAIL_FROM");
  }

  const { data, error } = await resend.emails.send({
    from: process.env.EMAIL_FROM,
    to: args.to,
    subject: args.subject,
    html: args.html,
    replyTo: args.replyTo
  });

  if (error) {
    throw new Error(error.message);
  }

  return {
    id: data?.id ?? null
  };
}
