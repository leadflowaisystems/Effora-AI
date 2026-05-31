import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { testNoOp }                  from "@/lib/inngest/functions/test";
import { onDmReceived }              from "@/lib/inngest/functions/on-dm-received";
import { onBookingCreated }          from "@/lib/inngest/functions/on-booking-created";
import { onBookingNoShow }           from "@/lib/inngest/functions/on-booking-no-show";
import { onBookingConfirmMessage }   from "@/lib/inngest/functions/on-booking-confirm-message";
import { onPaymentCreated }          from "@/lib/inngest/functions/on-payment-created";
import { onPaymentUnpaid }           from "@/lib/inngest/functions/on-payment-unpaid";
import { onPaymentLinkMessage }      from "@/lib/inngest/functions/on-payment-link-message";
import { onGhostRevival }            from "@/lib/inngest/functions/on-ghost-revival";
import { aggregateDailyMetrics }     from "@/lib/inngest/functions/daily-metrics";
import { onWeeklyReport }            from "@/lib/inngest/functions/on-weekly-report";
import { onDailyCheckin }            from "@/lib/inngest/functions/on-daily-checkin";
import { onWeeklyScorecard }         from "@/lib/inngest/functions/on-weekly-scorecard";
import { onMissedTaskCron }          from "@/lib/inngest/functions/on-missed-task-cron";
import { onTrialExpiry }             from "@/lib/inngest/functions/on-trial-expiry";
import { onMonthlyReset }            from "@/lib/inngest/functions/on-monthly-reset";
import { onMetaTokenRefresh }        from "@/lib/inngest/functions/on-meta-token-refresh";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    testNoOp,
    onDmReceived,
    onBookingCreated,
    onBookingNoShow,
    onBookingConfirmMessage,
    onPaymentCreated,
    onPaymentUnpaid,
    onPaymentLinkMessage,
    onGhostRevival,
    aggregateDailyMetrics,
    onWeeklyReport,
    onDailyCheckin,
    onWeeklyScorecard,
    onMissedTaskCron,
    onTrialExpiry,
    onMonthlyReset,
    onMetaTokenRefresh,
  ],
});
