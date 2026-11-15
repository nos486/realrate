/**
 * readJsonObject.test.js — A request body that is not a JSON object reads as {} (a handler then
 * answers with its own validation error instead of failing on `body.field`)
 */

import { describe, it, expect } from 'vitest';
import { readJsonObject } from '../../src/lib/helpers.js';

const post = (body) => new Request('https://api.test/x', { method: 'POST', body });

describe('readJsonObject', () => {
  it('returns the object of a JSON object body', async () => {
    expect(await readJsonObject(post('{"a":1}'))).toEqual({ a: 1 });
  });

  it.each(['null', '5', '"text"', '[1,2]', 'not json', ''])('reads %j as an empty object', async (body) => {
    expect(await readJsonObject(post(body))).toEqual({});
  });
});
