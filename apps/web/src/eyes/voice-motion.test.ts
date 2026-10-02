import { describe, expect, test } from 'bun:test';
import { createBus } from '../bus/bus.ts';
import { createVoiceMotion } from './voice-motion.ts';

/**
 * A voice motion on a clock the test moves by hand.
 *
 * @returns The bus, the motion and a way to let time pass.
 */
function motionOnAClock() {
  let at = 0;
  const bus = createBus();
  const motion = createVoiceMotion(bus, () => at);
  return {
    bus,
    motion,
    pass(ms: number) {
      at += ms;
    },
  };
}

describe('the voice motion', () => {
  test('is still when nobody makes a sound', () => {
    expect(motionOnAClock().motion.offsets()).toEqual({});
  });

  test('stretches the eyes while he talks, more when louder', () => {
    const { bus, motion } = motionOnAClock();
    bus.publish({ type: 'voice.level', ts: 0, who: 'self', level: 0.3, brightness: 0.5 });
    const quiet = motion.offsets().leftSquash ?? 0;
    bus.publish({ type: 'voice.level', ts: 0, who: 'self', level: 0.9, brightness: 0.5 });
    const loud = motion.offsets().leftSquash ?? 0;
    expect(quiet).toBeLessThan(0);
    expect(loud).toBeLessThan(quiet);
  });

  test('brightness makes the two eyes differ', () => {
    const { bus, motion } = motionOnAClock();
    bus.publish({ type: 'voice.level', ts: 0, who: 'self', level: 0.8, brightness: 1 });
    const offsets = motion.offsets();
    expect(offsets.leftSquash).not.toBe(offsets.rightSquash);
  });

  test('listening is a different motion: pupils and brows, not a stretch', () => {
    const { bus, motion } = motionOnAClock();
    bus.publish({ type: 'voice.level', ts: 0, who: 'other', level: 0.8, brightness: 0.5 });
    const offsets = motion.offsets();
    expect(offsets.leftPupil).toBeGreaterThan(0);
    expect(offsets.leftBrowTilt).toBeGreaterThan(0);
    expect(offsets.leftLowerLid).toBeUndefined();
  });

  test('his own voice wins over the microphone', () => {
    const { bus, motion } = motionOnAClock();
    bus.publish({ type: 'voice.level', ts: 0, who: 'other', level: 0.8, brightness: 0.5 });
    bus.publish({ type: 'voice.level', ts: 0, who: 'self', level: 0.5, brightness: 0.5 });
    expect(motion.offsets().leftPupil).toBeUndefined();
  });

  test('settles once the sound stops arriving', () => {
    const { bus, motion, pass } = motionOnAClock();
    bus.publish({ type: 'voice.level', ts: 0, who: 'self', level: 0.8, brightness: 0.5 });
    pass(400);
    expect(motion.offsets()).toEqual({});
  });
});
