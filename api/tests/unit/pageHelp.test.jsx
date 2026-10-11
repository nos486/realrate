// @vitest-environment happy-dom
/**
 * pageHelp.test.jsx — the «?» beside a page's title: every page that names a help row has one,
 * and the button opens it.
 */
import React from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, screen, fireEvent } from '@testing-library/react';

import { PAGE_HELP } from '../../../web/src/shared/help/pageHelp.js';
import HelpButton from '../../../web/src/shared/help/HelpButton.jsx';
import FeaturePageHeader from '../../../web/src/shared/ui/FeaturePageHeader.jsx';

afterEach(cleanup);

const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));

describe('page help', () => {
  it('every row has a title, an intro and steps', () => {
    for (const [key, row] of Object.entries(PAGE_HELP)) {
      expect(row.title, key).toBeTruthy();
      expect(row.intro, key).toBeTruthy();
      expect(row.steps.length, key).toBeGreaterThan(0);
    }
  });

  it('every page naming a help row has that row', () => {
    const root = path.resolve(__dirname, '../../../web/src/features');
    const named = new Set();
    for (const file of walk(root).filter((f) => /\.jsx$/.test(f))) {
      const text = fs.readFileSync(file, 'utf8');
      for (const m of text.matchAll(/\bhelp(?:: '|="|=\{')([a-z]+)['"]/g)) named.add(m[1]);
    }
    expect(named.size).toBeGreaterThan(5);
    for (const key of named) expect(PAGE_HELP[key], key).toBeTruthy();
  });

  it('the button opens the page\'s help; a page without one shows no button', () => {
    const { container } = render(<HelpButton page="accounts" />);
    expect(screen.queryByText(PAGE_HELP.accounts.intro)).toBeNull();
    fireEvent.click(screen.getByLabelText('راهنمای این صفحه'));
    expect(screen.getByText(PAGE_HELP.accounts.intro)).toBeTruthy();
    cleanup();
    const { container: none } = render(<HelpButton page="nope" />);
    expect(none.querySelector('.page-help-btn')).toBeNull();
    expect(container).toBeTruthy();
  });

  it('the header shows the button only when it names a help row', () => {
    const { rerender } = render(<FeaturePageHeader icon={null} title="حساب‌ها" help="accounts" />);
    expect(screen.getByLabelText('راهنمای این صفحه')).toBeTruthy();
    rerender(<FeaturePageHeader icon={null} title="حساب‌ها" />);
    expect(screen.queryByLabelText('راهنمای این صفحه')).toBeNull();
  });
});
