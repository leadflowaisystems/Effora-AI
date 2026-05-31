/** Shared inline styles for all Effora AI transactional emails */
const base = `
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  background: #0A0A0C; color: #E8E8EC;
  margin: 0; padding: 0;
`;
const card = `
  max-width: 520px; margin: 32px auto; background: #141418;
  border: 1px solid #2A2A30; border-radius: 12px; padding: 32px;
`;
const h1 = `font-size: 20px; font-weight: 700; color: #E8E8EC; margin: 0 0 8px;`;
const p  = `font-size: 14px; color: #9B9BA8; line-height: 1.6; margin: 0 0 16px;`;
const btn = `
  display: inline-block; background: #39D68A; color: #0A0A0C;
  font-weight: 700; font-size: 14px; padding: 12px 24px;
  border-radius: 8px; text-decoration: none; margin-top: 8px;
`;
const footer = `font-size: 11px; color: #5A5A68; margin-top: 24px; border-top: 1px solid #2A2A30; padding-top: 16px;`;

function wrap(body: string): string {
  return `<!DOCTYPE html><html><body style="${base}"><div style="${card}">${body}<div style="${footer}">Sent by Effora AI · To stop receiving these emails, contact your coach.</div></div></body></html>`;
}

export function bookingConfirmation(p: {
  leadName: string; meetingTime: string; meetingUrl: string; coachName: string;
}): string {
  return wrap(`
    <h1 style="${h1}">Your call is booked! 🎉</h1>
    <p style="${p}">Hi ${p.leadName}, your discovery call with ${p.coachName} is confirmed.</p>
    <p style="${p}"><strong style="color:#E8E8EC">When:</strong> ${p.meetingTime}</p>
    <a href="${p.meetingUrl}" style="${btn}">View / Reschedule →</a>
  `);
}

export function bookingReminder24h(p: {
  leadName: string; meetingTime: string; meetingUrl: string; coachName: string;
}): string {
  return wrap(`
    <h1 style="${h1}">Your call is tomorrow ⏰</h1>
    <p style="${p}">Hi ${p.leadName}, just a reminder that your discovery call with ${p.coachName} is in 24 hours.</p>
    <p style="${p}"><strong style="color:#E8E8EC">When:</strong> ${p.meetingTime}</p>
    <a href="${p.meetingUrl}" style="${btn}">View Details →</a>
  `);
}

export function paymentLink(p: {
  leadName: string; amount: string; description: string; paymentUrl: string; coachName: string;
}): string {
  return wrap(`
    <h1 style="${h1}">Your payment link is ready 💳</h1>
    <p style="${p}">Hi ${p.leadName}, ${p.coachName} has sent you a payment link.</p>
    <p style="${p}"><strong style="color:#E8E8EC">Amount:</strong> ${p.amount}</p>
    <p style="${p}"><strong style="color:#E8E8EC">For:</strong> ${p.description}</p>
    <a href="${p.paymentUrl}" style="${btn}">Pay Now →</a>
  `);
}

export function dunningEmail(p: {
  leadName: string; daysOverdue: number; paymentUrl: string; coachName: string;
}): string {
  return wrap(`
    <h1 style="${h1}">Payment reminder from ${p.coachName}</h1>
    <p style="${p}">Hi ${p.leadName}, your payment is ${p.daysOverdue} day${p.daysOverdue !== 1 ? "s" : ""} overdue. Please complete it to keep your spot.</p>
    <a href="${p.paymentUrl}" style="${btn}">Complete Payment →</a>
  `);
}

export function revivalNudge(p: {
  leadName: string; programName: string; ctaUrl: string; coachName: string;
}): string {
  return wrap(`
    <h1 style="${h1}">Still interested in ${p.programName}?</h1>
    <p style="${p}">Hi ${p.leadName}, ${p.coachName} here. You showed interest in ${p.programName} a while back — the door is still open if you're ready.</p>
    <a href="${p.ctaUrl}" style="${btn}">Reconnect →</a>
  `);
}

export function paymentReceived(p: {
  leadName: string; amount: string; description: string; coachName: string;
}): string {
  return wrap(`
    <h1 style="${h1}">Payment received</h1>
    <p style="${p}">Hi ${p.leadName}, your payment of ${p.amount} for <strong style="color:#E8E8EC">${p.description}</strong> has been confirmed.</p>
    <p style="${p}">Welcome to the program. ${p.coachName} will be in touch shortly with next steps.</p>
  `);
}
