import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendResendEmail(args: {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
}) {
  if (!process.env.RESEND_API_KEY) {
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
