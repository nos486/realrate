// @vitest-environment happy-dom
import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import AiHelpModal from '../../../web/src/features/ai/AiHelpModal.jsx';
import { aiCapabilities } from '../../../web/src/features/ai/aiHelp.js';
import { AI_INTENTS } from '../../../web/src/features/ai/aiIntents.js';

afterEach(cleanup);

describe('the voice AI help', () => {
  it('lists every intent the assistant handles, with examples to say', () => {
    const keys = aiCapabilities().map((c) => c.key);
    for (const intent of Object.keys(AI_INTENTS)) expect(keys).toContain(intent);
    for (const c of aiCapabilities().filter((x) => ['records', 'question', 'edit', 'create'].includes(x.key))) expect(c.examples.length).toBeGreaterThan(0);
  });

  it('shows all of them when open and nothing when closed', () => {
    expect(render(<AiHelpModal open={false} onClose={() => {}} />).container.innerHTML).toBe('');
    render(<AiHelpModal open onClose={() => {}} />);
    expect(document.querySelectorAll('.ai-help-item').length).toBe(aiCapabilities().length);
  });
});
