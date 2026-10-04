// @vitest-environment happy-dom
/**
 * appLayout.test.jsx — The mobile website and the Android app share one frame: a phone-sized
 * screen gets the app's top bar and bottom navigation, a wider one the site's header
 */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../../web/src/shared/native/nativeApp.js', () => ({ isNativeApp: () => false }));
vi.mock('../../../web/src/components/Header.jsx', () => ({ default: () => <header className="site-header" /> }));
vi.mock('../../../web/src/components/Footer.jsx', () => ({ default: () => <footer /> }));
vi.mock('../../../web/src/shared/app/AppShell.jsx', () => ({
  AppTopBar: () => <div className="app-topbar" />,
  AppBottomNav: () => <nav className="app-bottom-nav" />,
}));
vi.mock('../../../web/src/shared/app/AppUpdatePrompt.jsx', () => ({ default: () => null, AppUpdateBanner: () => null }));
vi.mock('../../../web/src/shared/app/AppSuggestBanner.jsx', () => ({ default: () => null }));
vi.mock('../../../web/src/shared/app/AppSetupPrompt.jsx', () => ({ default: () => null }));
vi.mock('../../../web/src/features/demo/index.js', () => ({ DemoBanner: () => null }));
vi.mock('../../../web/src/shared/offline/OfflineBar.jsx', () => ({ default: () => null }));

import AppLayout from '../../../web/src/shared/ui/AppLayout.jsx';
import { isAppLayout, initAppLayoutClass } from '../../../web/src/shared/app/appLayout.js';

function screen(width) {
  window.matchMedia = (query) => ({
    matches: query.includes('max-width: 768px') && width <= 768,
    addEventListener() {},
    removeEventListener() {},
  });
}

afterEach(cleanup);

const nav = [{ value: 'market', label: 'خانه' }, { value: 'expenses', label: 'هزینه‌ها' }];
const renderLayout = () => render(<MemoryRouter><AppLayout navItems={nav} activeTab="expenses"><p>page</p></AppLayout></MemoryRouter>);

describe('one frame for the mobile website and the app', () => {
  it('a phone-sized screen: the app frame', () => {
    screen(390);
    expect(isAppLayout()).toBe(true);
    const { container } = renderLayout();
    expect(container.querySelector('.app-topbar')).not.toBeNull();
    expect(container.querySelector('.app-bottom-nav')).not.toBeNull();
    expect(container.querySelector('.site-header')).toBeNull();
    initAppLayoutClass();
    expect(document.documentElement.classList.contains('is-app-layout')).toBe(true);
  });

  it('a wider screen: the site header', () => {
    screen(1280);
    expect(isAppLayout()).toBe(false);
    const { container } = renderLayout();
    expect(container.querySelector('.site-header')).not.toBeNull();
    expect(container.querySelector('.app-bottom-nav')).toBeNull();
    initAppLayoutClass();
    expect(document.documentElement.classList.contains('is-app-layout')).toBe(false);
  });
});
