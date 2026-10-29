import {
  act,
  render,
  renderHook,
  screen,
  fireEvent,
} from "@testing-library/react";
import { vi, afterEach, describe, it, expect } from "vitest";
import App from "../App";
import PanelPage from "../PanelPage";
import { Dashboard } from "../Dashboard";
import { ParkingMap } from "../ParkingMap";
import { useParking } from "../useParking";
import { isSnapshot } from "../api";
import type { Snapshot } from "../types";

const snapshot: Snapshot = {
  spots: [
    {
      spotCode: "A-01",
      status: "FREE",
      sector: "A",
      accessible: true,
      layoutOrder: 0,
      polygon: [
        { x: 0.1, y: 0.1 },
        { x: 0.2, y: 0.1 },
        { x: 0.2, y: 0.2 },
      ],
      lastObserved: "2026-10-07T12:00:00Z",
      lastUpdated: "2026-10-07T12:00:00Z",
    },
    {
      spotCode: "B-01",
      status: "OCCUPIED",
      sector: "B",
      accessible: false,
      layoutOrder: 0,
      polygon: [
        { x: 0.3, y: 0.6 },
        { x: 0.4, y: 0.6 },
        { x: 0.4, y: 0.7 },
      ],
      lastObserved: "2026-10-07T12:00:00Z",
      lastUpdated: "2026-10-07T12:00:00Z",
    },
  ],
  summary: { total: 2, free: 1, occupied: 1, reserved: 0, unknown: 0, occupancyPercent: 50 },
  version: 1, serverTime: "2026-10-07T12:00:00Z",
  monitoringActive: true,
};

it("apresenta somente o painel na página dedicada", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => respond()),
  );
  render(<PanelPage />);
  expect(
    await screen.findByRole("button", { name: "A-01 Livre Acessível" }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "B-01 Ocupada" }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Mapa" }),
  ).not.toBeInTheDocument();
  expect(screen.queryByText("MOBILIDADE NO CAMPUS")).not.toBeInTheDocument();
  expect(screen.queryByRole("link", {name:"Reservar pelo celular"})).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Resumo das vagas")).not.toBeInTheDocument();
});
function respond(data = snapshot) {
  return Promise.resolve({ ok: true, json: async () => data } as Response);
}
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("visualização das vagas", () => {
  it("mostra identificadores, estados textuais, acessibilidade e painel", () => {
    render(<ParkingMap spots={snapshot.spots} />);
    expect(
      screen.getByRole("button", { name: "A-01 · Livre · Acessível" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "B-01 · Ocupada" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Painel" }));
    expect(
      screen.getByRole("button", { name: "A-01 Livre Acessível" }),
    ).toBeInTheDocument();
  });
  it("apresenta desconhecido sem depender de cor", () => {
    render(
      <ParkingMap spots={[{ ...snapshot.spots[0], status: "UNKNOWN" }]} />,
    );
    expect(
      screen.getByRole("button", { name: "A-01 · Desconhecida · Acessível" }),
    ).toBeInTheDocument();
  });
  it("mostra indicadores fornecidos pelo backend", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => respond()),
    );
    render(<Dashboard mobile />);
    expect(
      await screen.findByText("50% de ocupação das vagas conhecidas"),
    ).toBeInTheDocument();
    expect(screen.getByText("Monitoramento ativo")).toBeInTheDocument();
  });
  it("trata catálogo vazio", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        respond({
          ...snapshot,
          spots: [],
          summary: {
            total: 0,
            free: 0,
            occupied: 0,
            reserved: 0, unknown: 0,
            occupancyPercent: null,
          },
        }),
      ),
    );
    render(<App />);
    expect(
      await screen.findByText("Nenhuma vaga cadastrada"),
    ).toBeInTheDocument();
  });
});

describe("polling e recuperação", () => {
  it("consulta após 15 segundos, preserva dados e tenta após 30 segundos na falha", async () => {
    vi.useFakeTimers();
    const fetch = vi
      .fn()
      .mockImplementationOnce(() => respond())
      .mockRejectedValueOnce(new Error("offline"))
      .mockImplementation(() => respond());
    vi.stubGlobal("fetch", fetch);
    const { result } = renderHook(() => useParking());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.data?.summary.total).toBe(2);
    const updated = result.current.updated;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15000);
    });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(result.current.data?.summary.total).toBe(2);
    expect(result.current.updated).toBe(updated);
    expect(result.current.connected).toBe(false);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(29999);
    });
    expect(fetch).toHaveBeenCalledTimes(2);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(result.current.connected).toBe(true);
  });
  it("apresenta a mudança recebida na próxima consulta sem recarregar a página", async () => {
    vi.useFakeTimers();
    const changed: Snapshot = {
      ...snapshot,
      version: 2,
      spots: snapshot.spots.map((spot) => ({ ...spot, status: "OCCUPIED" })),
      summary: { total: 2, free: 0, occupied: 2, reserved: 0, unknown: 0, occupancyPercent: 100 },
    };
    const fetch = vi.fn()
      .mockImplementationOnce(() => respond())
      .mockImplementation(() => respond(changed));
    vi.stubGlobal("fetch", fetch);
    const { result } = renderHook(() => useParking());
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(result.current.data?.spots[0].status).toBe("FREE");
    await act(async () => { await vi.advanceTimersByTimeAsync(14999); });
    expect(fetch).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(result.current.data?.spots[0].status).toBe("OCCUPIED");
    expect(result.current.data?.summary.occupancyPercent).toBe(100);
  });
  it("não sobrepõe consultas e cancela ao desmontar", async () => {
    vi.useFakeTimers();
    const fetch = vi.fn<
      (url: string, options: RequestInit) => Promise<Response>
    >(() => new Promise<Response>(() => {}));
    vi.stubGlobal("fetch", fetch);
    const { unmount, result } = renderHook(() => useParking());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result.current.loading).toBe(true);
    const signal = fetch.mock.calls[0][1].signal as AbortSignal;
    unmount();
    expect(signal.aborted).toBe(true);
  });
  it("mantém cache após recarregar a página durante falha", async () => {
    localStorage.setItem(
      "parking-fag:last-observation:v2",
      JSON.stringify(snapshot),
    );
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const { result } = renderHook(() => useParking());
    await act(async () => {});
    expect(result.current.data?.spots[0].status).toBe("FREE");
    expect(result.current.updated).toBe("2026-10-07T12:00:00Z");
  });
  it("rejeita payload inválido", () => {
    expect(
      isSnapshot({
        spots: [],
        summary: { total: 5, free: 0, occupied: 0, reserved: 0, unknown: 0 },
      }),
    ).toBe(false);
    expect(isSnapshot(snapshot)).toBe(true);
  });
});
