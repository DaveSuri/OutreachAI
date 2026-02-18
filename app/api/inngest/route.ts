import { serve } from "inngest/next";
import { inngestFunctions } from "@/src/inngest/functions";
import { inngest } from "@/src/lib/inngest";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: inngestFunctions
});
