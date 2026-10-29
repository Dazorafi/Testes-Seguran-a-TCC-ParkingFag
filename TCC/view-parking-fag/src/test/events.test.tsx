import { act, renderHook } from "@testing-library/react";
import { it, expect, vi } from "vitest";
import { useParking } from "../useParking";

it("descarta eventos antigos e recupera snapshot na reconexão", async () => {
  vi.useFakeTimers();
  const instances: Socket[] = [];
  class Socket {
    onmessage?: (event: { data: string }) => void;
    onclose?: () => void;
    close() {}
    constructor() { instances.push(this); }
  }
  const snapshot = { version: 5, serverTime: "2026-10-15T15:00:00Z", monitoringActive: true, spots: [],
    summary: { total: 0, free: 0, occupied: 0, reserved: 0, unknown: 0 } };
  vi.stubGlobal("WebSocket", Socket);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => snapshot }));
  const { result, unmount } = renderHook(() => useParking());
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  act(() => instances[0].onmessage?.({ data: JSON.stringify({ ...snapshot, version: 4 }) }));
  expect(result.current.data?.version).toBe(5);
  act(() => instances[0].onclose?.());
  await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
  expect(instances).toHaveLength(2);
  act(() => instances[1].onmessage?.({ data: JSON.stringify({ ...snapshot, version: 8 }) }));
  expect(result.current.data?.version).toBe(8);
  unmount(); vi.useRealTimers(); vi.unstubAllGlobals();
});
