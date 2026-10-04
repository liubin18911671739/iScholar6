import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { subscribeRunEvents } from "@/lib/client/agents";

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  listeners: Record<string, Array<(event: MessageEvent) => void>> = {};
  closed = false;

  constructor(public url: string) {
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, callback: EventListener) {
    (this.listeners[type] ??= []).push(callback as (event: MessageEvent) => void);
  }

  close() {
    this.closed = true;
  }

  emit(type: string, data: unknown) {
    this.emitRaw(type, JSON.stringify(data));
  }

  emitRaw(type: string, data: string) {
    const event = { data } as MessageEvent;
    (this.listeners[type] ?? []).forEach((callback) => callback(event));
  }
}

describe("subscribeRunEvents", () => {
  const original = (globalThis as { EventSource?: unknown }).EventSource;

  beforeEach(() => {
    FakeEventSource.instances = [];
    (globalThis as { EventSource?: unknown }).EventSource = FakeEventSource;
  });

  afterEach(() => {
    (globalThis as { EventSource?: unknown }).EventSource = original;
  });

  it("delivers message.delta chunks and closes on end", () => {
    const deltas: string[] = [];
    let endStatus = "";
    const unsubscribe = subscribeRunEvents("run-1", {
      onDelta: (text) => deltas.push(text),
      onEnd: (status) => {
        endStatus = status;
      },
    });

    const source = FakeEventSource.instances[0];
    expect(source.url).toContain("/runs/run-1/events");
    source.emit("message.delta", { text: "Hel" });
    source.emit("message.delta", { text: "lo" });
    source.emitRaw("message.delta", "not-json");
    source.emit("end", { status: "succeeded" });

    expect(deltas).toEqual(["Hel", "lo"]);
    expect(endStatus).toBe("succeeded");
    expect(source.closed).toBe(true);
    unsubscribe();
  });

  it("is a no-op when EventSource is unavailable", () => {
    (globalThis as { EventSource?: unknown }).EventSource = undefined;
    const unsubscribe = subscribeRunEvents("run-2", { onDelta: () => undefined });
    expect(unsubscribe).toBeTypeOf("function");
    expect(() => unsubscribe()).not.toThrow();
  });
});
