// @vitest-environment happy-dom
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';

let allowed = true;
vi.mock('../../../web/src/shared/features/index.js', () => ({ useFeature: () => allowed }));
vi.mock('../../../web/src/shared/ui/FeedbackProvider.jsx', () => ({ useFeedback: () => ({ toast: { error: vi.fn() } }) }));
vi.mock('../../../web/src/shared/native/voiceRecorder.js', () => ({ canRecordVoice: () => true, startVoiceRecording: vi.fn() }));
vi.mock('../../../web/src/shared/native/dictateApi.js', () => ({ dictateByVoice: vi.fn() }));

const { Input } = await import('../../../web/src/shared/ui/Input.jsx');

afterEach(cleanup);

describe('Input dictation', () => {
  it('shows a microphone only with onDictate and the feature on', () => {
    allowed = true;
    expect(render(<Input id="a" value="" onChange={() => {}} onDictate={() => {}} />).container.querySelector('.ui-dictate-btn')).toBeTruthy();
    cleanup();
    expect(render(<Input id="b" value="" onChange={() => {}} />).container.querySelector('.ui-dictate-btn')).toBeNull();
    cleanup();
    allowed = false;
    expect(render(<Input id="c" value="" onChange={() => {}} onDictate={() => {}} />).container.querySelector('.ui-dictate-btn')).toBeNull();
  });
});
