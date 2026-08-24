/**
 * scripts/demo-reset.ts
 *
 * Restores the demo org to its exact starting state in one command.
 * Run this between prospect demos.
 *
 *   npx tsx scripts/demo-reset.ts
 *
 * Wipes every lead, conversation, message, booking, payment and sequence run
 * belonging to the demo org, then re-seeds the same 8 enquiries. The org
 * itself, its membership, its voice profile and its Razorpay credentials are
 * preserved, so you never have to reconnect anything between demos.
 *
 * Scoped strictly to the demo org (slug: ascent-academy-demo). It cannot touch
 * a real client's data.
 */

import { main } from "./demo-seed";

main(true).catch((e) => {
  console.error("\n✗ demo-reset failed:", e);
  process.exit(1);
});
