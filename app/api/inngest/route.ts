import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { testNoOp }                  from "@/lib/inngest/functions/test";
import { onDmReceived }              from "@/lib/inngest/functions/on-dm-received";
import { onBookingCreated }          from "@/lib/inngest/functions/on-booking-created";
import { onBookingNoShow }           from "@/lib/inngest/functions/on-booking-no-show";
import { onBookingConfirmMessage }   from "@/lib/inngest/functions/on-booking-confirm-message";
import { onPaymentCreated }          from "@/lib/inngest/functions/on-payment-created";
import { onPaymentCaptured }         from "@/lib/inngest/functions/on-payment-captured";
import { onMetaDataDeletion }        from "@/lib/inngest/functions/on-meta-data-deletion";
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
import { onMetaTokenRefresh }           from "@/lib/inngest/functions/on-meta-token-refresh";
import { onWhatsAppMessageReceived }    from "@/lib/inngest/functions/on-whatsapp-message-received";
import { onBroadcastProcess }           from "@/lib/inngest/functions/on-broadcast-process";
import { onBroadcastCron }             from "@/lib/inngest/functions/on-broadcast-cron";
import { onRecurringPaymentCron }      from "@/lib/inngest/functions/on-recurring-payment-cron";
import { onScheduledPaymentCron }      from "@/lib/inngest/functions/on-scheduled-payment-cron";
import { onRecurringBookingCron }      from "@/lib/inngest/functions/on-recurring-booking-cron";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    testNoOp,
    onDmReceived,
    onBookingCreated,
    onBookingNoShow,
    onBookingConfirmMessage,
    onPaymentCreated,
    onPaymentCaptured,
    onMetaDataDeletion,
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
    onWhatsAppMessageReceived,
    onBroadcastProcess,
    onBroadcastCron,
    onRecurringPaymentCron,
    onScheduledPaymentCron,
    onRecurringBookingCron,
  ],
});
