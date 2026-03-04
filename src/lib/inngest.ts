import { Inngest } from "inngest";

export const inngest = new Inngest({
  id: "outreachai",
  eventKey: process.env.INNGEST_EVENT_KEY
});
