import type { Snapshot } from "./types";

export function isSnapshot(value: unknown): value is Snapshot {
  if (!value || typeof value !== "object") return false;
  const data = value as Snapshot;
  return (
    Array.isArray(data.spots) &&
    data.spots.every(
      (s) =>
        typeof s.spotCode === "string" &&
        ["FREE", "OCCUPIED", "UNKNOWN", "RESERVED"].includes(s.status) &&
        typeof s.sector === "string" &&
        typeof s.accessible === "boolean" &&
        typeof s.layoutOrder === "number" &&
        Array.isArray(s.polygon) &&
        s.polygon.length >= 3 &&
        s.polygon.every(
          (p) =>
            Number.isFinite(p.x) &&
            Number.isFinite(p.y) &&
            p.x >= 0 &&
            p.x <= 1 &&
            p.y >= 0 &&
            p.y <= 1,
        ),
    ) &&
    !!data.summary &&
    ["total", "free", "occupied", "reserved", "unknown"].every(
      (key) =>
        Number.isInteger(data.summary[key as keyof typeof data.summary]) &&
        (data.summary[key as keyof typeof data.summary] as number) >= 0,
    ) &&
    data.summary.total === data.spots.length &&
    data.summary.total ===
      data.summary.free + data.summary.occupied + data.summary.reserved + data.summary.unknown &&
    typeof data.monitoringActive === "boolean" &&
    Number.isSafeInteger(data.version) && data.version >= 0 &&
    Number.isFinite(Date.parse(data.serverTime))
  );
}

export const apiBase = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");
export async function request<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${apiBase}/api/v1${path}`, {
    method: body === undefined ? "GET" : "POST",
    credentials: "include", cache: "no-store", signal: AbortSignal.timeout(8000),
    headers: body === undefined ? {} : { "Content-Type": "application/json", "X-Parking-Client": "mobile" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "Não foi possível concluir a operação");
  return data as T;
}

export async function fetchSnapshot(signal: AbortSignal): Promise<Snapshot> {
  const response = await fetch(
    `${(import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "")}/api/v1/parking-spots`,
    { signal, cache: "no-store" },
  );
  if (!response.ok) throw new Error("Não foi possível consultar as vagas");
  const data: unknown = await response.json();
  if (!isSnapshot(data)) throw new Error("Resposta inválida");
  return data;
}
