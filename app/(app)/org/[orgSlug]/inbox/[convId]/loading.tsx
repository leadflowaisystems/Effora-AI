/**
 * Shows ThreadSkeleton immediately while [convId]/page server-renders.
 * Gives instant visual feedback on conversation switch — no blank flash.
 */
import { ThreadSkeleton } from "@/components/inbox/thread-view";

export default function Loading() {
  return <ThreadSkeleton />;
}
