import { inngest } from "../client";

export const testNoOp = inngest.createFunction(
  { id: "test-no-op", name: "Test No-Op" },
  { event: "test/no-op" },
  async ({ event, step }) => {
    const result = await step.run("log-event", () => {
      console.log("[inngest] test/no-op fired", event.data);
      return { received: true };
    });
    return result;
  }
);
