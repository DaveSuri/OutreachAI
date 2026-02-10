import { Inngest } from "inngest";
import { env } from "@/lib/env";

export const inngest = new Inngest({
  id: "outreachai",
  name: "OutreachAI",
  eventKey: env.INNGEST_EVENT_KEY || "dev-event-key"
});
