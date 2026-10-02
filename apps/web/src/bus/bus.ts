/**
 * The typed event bus. Every browser module publishes here and subscribes here,
 * and none of them holds a reference to another, which is what keeps the senses
 * from knowing the eyes exist.
 */
import type { SenseEvent, SenseEventOf, SenseEventType } from '@m8/shared';

/** Drops a subscription. Calling it twice is safe. */
export type Unsubscribe = () => void;

/** The spine of the browser app. */
export interface Bus {
  /**
   * Send an event to every listener that wants it.
   *
   * @remarks
   * The event is not validated. Publishers are typed, and the one path that
   * carries untrusted events, loading a recording, parses it against the schema
   * before it gets here. Validating on a bus that carries fifteen events a
   * second would cost more than it catches.
   *
   * @param event - What happened.
   */
  publish(event: SenseEvent): void;
  /**
   * Listen to everything. Used by the timeline and the recorder.
   *
   * @param listener - Called once per event, in publish order.
   * @returns The unsubscribe.
   */
  subscribe(listener: (event: SenseEvent) => void): Unsubscribe;
  /**
   * Listen to one kind of event.
   *
   * @param type - Which kind.
   * @param listener - Called with that kind, already narrowed.
   * @returns The unsubscribe.
   */
  on<Type extends SenseEventType>(
    type: Type,
    listener: (event: SenseEventOf<Type>) => void,
  ): Unsubscribe;
}

/** A listener that has been narrowed away, kept as the widest thing it can be. */
type AnyListener = (event: never) => void;

/**
 * Build a bus.
 *
 * @returns An empty bus. Listeners added while an event is being delivered do
 * not receive that event, and listeners removed during delivery still do: the
 * set is copied before the walk, so a handler that resubscribes cannot loop.
 */
export function createBus(): Bus {
  const everything = new Set<(event: SenseEvent) => void>();
  const byType = new Map<SenseEventType, Set<AnyListener>>();

  return {
    publish(event) {
      for (const listener of [...everything]) listener(event);
      const listeners = byType.get(event.type);
      if (!listeners) return;
      for (const listener of [...listeners]) (listener as (seen: SenseEvent) => void)(event);
    },

    subscribe(listener) {
      everything.add(listener);
      return () => {
        everything.delete(listener);
      };
    },

    on(type, listener) {
      const listeners = byType.get(type) ?? new Set<AnyListener>();
      byType.set(type, listeners);
      listeners.add(listener as AnyListener);
      return () => {
        listeners.delete(listener as AnyListener);
      };
    },
  };
}
