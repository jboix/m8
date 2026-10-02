/** The line under the eyes. */
import { describe, expect, test } from 'bun:test';
import { type StageHealth, stageNotice } from './stage-notice.ts';

/** Everything working. */
const FINE: StageHealth = {
  tapToWake: null,
  cameraFault: null,
  session: 'live',
  sessionDetail: undefined,
  sessionWanted: true,
};

describe('stageNotice', () => {
  test('says nothing when everything works', () => {
    expect(stageNotice(FINE)).toBeNull();
  });

  test('says why the session failed, ahead of a camera fault', () => {
    const notice = stageNotice({
      ...FINE,
      cameraFault: 'No camera.',
      session: 'failed',
      sessionDetail: 'no key',
    });

    expect(notice).toBe('He cannot hear or speak right now: no key. Trying again.');
  });

  test('asks for a touch before anything else', () => {
    expect(stageNotice({ ...FINE, tapToWake: 'Tap anywhere.', session: 'failed' })).toBe(
      'Tap anywhere.',
    );
  });

  test('says it is reconnecting', () => {
    expect(stageNotice({ ...FINE, session: 'reconnecting' })).toContain('Reconnecting');
  });

  test('does not call a session that is meant to be closed a fault', () => {
    expect(stageNotice({ ...FINE, session: 'failed', sessionWanted: false })).toBeNull();
    expect(stageNotice({ ...FINE, cameraFault: 'No camera.', sessionWanted: false })).toBe(
      'No camera.',
    );
  });
});
