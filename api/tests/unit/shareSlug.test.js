/**
 * shareSlug.test.js — generateRandomSlug: length, alphabet (no look-alike characters), and that
 * it draws from crypto.getRandomValues rather than Math.random (slugs are public share links).
 */

import { describe, it, expect, vi } from 'vitest';
import { generateRandomSlug } from '../../src/repositories/user.repository.js';

describe('generateRandomSlug', () => {
  it('returns the requested length from the unambiguous alphabet', () => {
    for (const len of [1, 8, 20]) {
      const slug = generateRandomSlug(len);
      expect(slug).toHaveLength(len);
      expect(slug).toMatch(/^[23456789abcdefghjkmnpqrstuvwxyz]+$/);
    }
  });

  it('does not use Math.random', () => {
    const spy = vi.spyOn(Math, 'random');
    generateRandomSlug(8);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('gives different slugs', () => {
    const slugs = new Set(Array.from({ length: 200 }, () => generateRandomSlug(8)));
    expect(slugs.size).toBe(200);
  });
});
