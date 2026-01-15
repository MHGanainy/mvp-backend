/**
 * Slug utility functions for generating URL-friendly slugs from titles.
 * Used by Course and CourseCase entities for clean, shareable URLs.
 */

/**
 * Generates a URL-friendly slug from a title string.
 * - Converts to lowercase
 * - Replaces non-alphanumeric characters with hyphens
 * - Removes leading/trailing hyphens
 * - Collapses multiple consecutive hyphens
 *
 * @example
 * generateSlug("Respiratory Medicine") // "respiratory-medicine"
 * generateSlug("PLAB 2 - UK Medical") // "plab-2-uk-medical"
 * generateSlug("Asthma Patient (Acute)") // "asthma-patient-acute"
 */
export function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')  // Replace non-alphanumeric with hyphen
    .replace(/^-+|-+$/g, '')      // Remove leading/trailing hyphens
    .replace(/-+/g, '-');         // Collapse multiple hyphens
}

/**
 * Generates a unique slug by appending a counter if the base slug already exists.
 * Uses a callback function to check if a slug exists in the database.
 *
 * @param title - The title to generate a slug from
 * @param checkExists - Async function that returns true if slug already exists
 * @returns A unique slug string
 *
 * @example
 * // If "asthma-patient" exists, returns "asthma-patient-1"
 * // If "asthma-patient-1" also exists, returns "asthma-patient-2"
 */
export async function generateUniqueSlug(
  title: string,
  checkExists: (slug: string) => Promise<boolean>
): Promise<string> {
  const baseSlug = generateSlug(title);
  let slug = baseSlug;
  let counter = 1;

  while (await checkExists(slug)) {
    slug = `${baseSlug}-${counter}`;
    counter++;
  }

  return slug;
}

/**
 * Validates if a string is a valid slug format.
 * Valid slugs contain only lowercase letters, numbers, and hyphens.
 */
export function isValidSlug(slug: string): boolean {
  return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug);
}
