import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";
afterEach(() => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
});

// WebSocket is mocked explicitly by tests exercising the real-time transport.
beforeEach(() => { vi.stubGlobal("WebSocket", undefined); });
