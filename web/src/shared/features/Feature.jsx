import React from 'react';
import { useFeature } from './useFeature.js';

/**
 * Feature — Declarative wrapper component for feature flags.
 * Renders children only when the specified feature is enabled for the current user.
 *
 * @param {object} props
 * @param {string} props.name - The feature key to check
 * @param {React.ReactNode} [props.fallback=null] - Optional fallback when disabled
 * @param {React.ReactNode} props.children
 */
export function Feature({ name, fallback = null, children }) {
  const isEnabled = useFeature(name);
  return isEnabled ? <>{children}</> : fallback;
}
