import { useEffect, useState } from "react";
import { apiBase, fetchSnapshot, isSnapshot } from "./api";
import type { Snapshot } from "./types";

const cacheKey = "parking-fag:last-observation:v2";
function readCache(): Snapshot | null {
  try { const data: unknown = JSON.parse(localStorage.getItem(cacheKey) || "null"); return isSnapshot(data) ? data : null; }
  catch { return null; }
}

export function useParking() {
  const [data, setData] = useState<Snapshot | null>(readCache);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  useEffect(() => {
    let active = true;
    let current: Snapshot | null = null;
    let socket: WebSocket | undefined;
    let next: ReturnType<typeof setTimeout>;
    let reconnect: ReturnType<typeof setTimeout>;
    let controller: AbortController;
    function accept(value: unknown) {
      if (!active || !isSnapshot(value)) return;
      if (current && (value.version < current.version || (value.version === current.version && value.serverTime < current.serverTime))) return;
      current = value;
      setData(value); setConnected(true); setLoading(false);
      try { localStorage.setItem(cacheKey, JSON.stringify(value)); } catch { /* Optional cache. */ }
    }
    async function poll() {
      controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      let delay = 15000;
      try { accept(await fetchSnapshot(controller.signal)); }
      catch { if (active) setConnected(false); delay = 30000; }
      finally { clearTimeout(timeout); if (active) { setLoading(false); next = setTimeout(poll, delay); } }
    }
    function connect() {
      if (!active || typeof WebSocket === "undefined") return;
      const url = new URL(`${apiBase}/api/v1/events`, window.location.href);
      url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
      socket = new WebSocket(url);
      socket.onmessage = (event) => { try { accept(JSON.parse(event.data)); } catch { /* Polling restores a valid snapshot. */ } };
      socket.onclose = () => { if (active) reconnect = setTimeout(connect, 3000); };
      socket.onerror = () => socket?.close();
    }
    void poll(); connect();
    return () => { active = false; clearTimeout(next); clearTimeout(reconnect); controller?.abort(); socket?.close(); };
  }, []);
  return { data, updated: data?.serverTime || null, loading: loading && !data, connected };
}
