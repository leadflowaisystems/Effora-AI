/**
 * lib/disposable-domains.ts — blocklist of top disposable/temporary email domains.
 * Used during signup/magic-link to reject throwaway addresses.
 */

const DISPOSABLE = new Set([
  "mailinator.com", "guerrillamail.com", "guerrillamail.net", "guerrillamail.org",
  "tempmail.com", "temp-mail.org", "temp-mail.io", "throwam.com",
  "sharklasers.com", "guerrillamailblock.com", "grr.la", "guerrillamail.info",
  "yopmail.com", "yopmail.fr", "cool.fr.nf", "jetable.fr.nf",
  "nospam.ze.tc", "nomail.xl.cx", "mega.zik.dj", "speed.1s.fr",
  "courriel.fr.nf", "moncourrier.fr.nf", "monemail.fr.nf", "monmail.fr.nf",
  "trashmail.com", "trashmail.at", "trashmail.io", "trashmail.me",
  "trashmail.net", "dispostable.com", "mailnull.com", "spamgourmet.com",
  "spamgourmet.net", "spamgourmet.org", "spamthisplease.com",
  "fakeinbox.com", "mailnesia.com", "mailnull.com", "spambox.us",
  "discard.email", "discardmail.com", "discardmail.de", "spamspot.com",
  "spamfree24.org", "spamfree24.de", "spamfree24.eu", "spamfree24.info",
  "throwam.com", "throwam.net", "maildrop.cc", "getairmail.com",
  "filzmail.com", "trashdevil.com", "trashdevil.de", "tempr.email",
]);

/** Returns true if the email's domain is on the disposable blocklist. */
export function isDisposableEmail(email: string): boolean {
  const domain = email.split("@")[1]?.toLowerCase();
  if (!domain) return false;
  return DISPOSABLE.has(domain);
}
