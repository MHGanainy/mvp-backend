// eslint-disable-next-line @typescript-eslint/no-require-imports
const disposableDomains = new Set<string>(require("disposable-email-domains") as string[]);

// Gmail (and its legacy googlemail.com alias) ignores dots in the local part.
const GMAIL_DOMAINS = new Set(["gmail.com", "googlemail.com"]);

/**
 * Strips plus-addressing from an email to produce a canonical form
 * used for deduplication in production.
 *
 * Handles two Gmail-specific tricks:
 *   omar+1@gmail.com   → omar@gmail.com   (plus-addressing)
 *   o.m.a.r@gmail.com  → omar@gmail.com   (dot trick)
 *
 * In non-production environments the email is returned as-is (after
 * lowercasing + trimming) so plus-addressed accounts work freely in
 * dev/staging.
 */
export function normalizeEmailForDedup(email: string): string {
  const base = email.toLowerCase().trim();

  if (process.env.NODE_ENV !== "production") {
    return base;
  }

  const atIndex = base.lastIndexOf("@");
  if (atIndex === -1) return base; // malformed — let Zod handle it upstream

  const domain = base.slice(atIndex + 1);
  let local = base.slice(0, atIndex).split("+")[0]; // strip plus-addressing

  if (GMAIL_DOMAINS.has(domain)) {
    local = local.replace(/\./g, ""); // strip dots for Gmail
  }

  return `${local}@${domain}`;
}

/**
 * Returns true if the email's domain is a known disposable/temporary
 * email provider. Checks the exact domain and all parent domains to
 * catch subdomain variants by walking up the domain tree.
 */
export function isDisposableEmail(email: string): boolean {
  const atIndex = email.lastIndexOf("@");
  if (atIndex === -1) return false;

  const domain = email.slice(atIndex + 1).toLowerCase().trim();
  const parts = domain.split(".");

  // Walk from most-specific to least-specific (sub.disposable.com → disposable.com)
  for (let i = 0; i < parts.length - 1; i++) {
    if (disposableDomains.has(parts.slice(i).join("."))) return true;
  }

  return false;
}
