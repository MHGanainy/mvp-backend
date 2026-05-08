import { describe, it, expect } from 'vitest';
import { generateSlug, generateUniqueSlug, isValidSlug } from './slug';

describe('generateSlug', () => {
  it('lowercases and hyphenates a plain title', () => {
    expect(generateSlug('Respiratory Medicine')).toBe('respiratory-medicine');
  });

  it('handles numbers and dashes in titles', () => {
    expect(generateSlug('PLAB 2 - UK Medical')).toBe('plab-2-uk-medical');
  });

  it('strips parentheses and special characters', () => {
    expect(generateSlug('Asthma Patient (Acute)')).toBe('asthma-patient-acute');
  });

  it('collapses consecutive hyphens into one', () => {
    expect(generateSlug('Hello   World')).toBe('hello-world');
  });

  it('strips leading and trailing hyphens', () => {
    expect(generateSlug('  - hello - ')).toBe('hello');
  });

  it('returns empty string for all-special-character input', () => {
    expect(generateSlug('!!!')).toBe('');
  });
});

describe('generateUniqueSlug', () => {
  it('returns the base slug when it does not exist', async () => {
    const slug = await generateUniqueSlug('Test Title', async () => false);
    expect(slug).toBe('test-title');
  });

  it('appends a counter when the base slug already exists', async () => {
    const existing = new Set(['test-title']);
    const slug = await generateUniqueSlug('Test Title', async (s) => existing.has(s));
    expect(slug).toBe('test-title-1');
  });

  it('increments the counter until a unique slug is found', async () => {
    const existing = new Set(['test-title', 'test-title-1', 'test-title-2']);
    const slug = await generateUniqueSlug('Test Title', async (s) => existing.has(s));
    expect(slug).toBe('test-title-3');
  });
});

describe('isValidSlug', () => {
  it('accepts lowercase alphanumeric slugs with hyphens', () => {
    expect(isValidSlug('respiratory-medicine')).toBe(true);
    expect(isValidSlug('plab-2-uk')).toBe(true);
  });

  it('rejects slugs with uppercase letters', () => {
    expect(isValidSlug('Respiratory')).toBe(false);
  });

  it('rejects slugs with leading or trailing hyphens', () => {
    expect(isValidSlug('-hello')).toBe(false);
    expect(isValidSlug('hello-')).toBe(false);
  });

  it('rejects slugs with spaces or special characters', () => {
    expect(isValidSlug('hello world')).toBe(false);
    expect(isValidSlug('hello_world')).toBe(false);
  });
});
