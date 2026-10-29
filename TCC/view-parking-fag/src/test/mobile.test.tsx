import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { MobileReservations } from "../MobileReservations";
import { Dashboard } from "../Dashboard";
import { ParkingMap } from "../ParkingMap";
import type { Reservation, Snapshot } from "../types";

const data: Snapshot = { version: 1, monitoringActive: true, serverTime: "2026-10-15T15:00:00Z",
  summary: { total: 2, free: 2, occupied: 0, reserved: 0, unknown: 0 },
  spots: [ { spotCode: "A", status: "FREE", sector: "A", accessible: false, layoutOrder: 0,
    polygon: [{x:.1,y:.1},{x:.2,y:.1},{x:.2,y:.2}], lastObserved: "", lastUpdated: "" },
  { spotCode: "PCD", status: "FREE", sector: "A", accessible: true, layoutOrder: 1,
    polygon: [{x:.2,y:.1},{x:.3,y:.1},{x:.3,y:.2}], lastObserved: "", lastUpdated: "" } ] };
const base: Reservation = { id: "id", spotCode: "A", status: "ACTIVE", createdAt: data.serverTime, expiresAt: "2026-10-15T15:01:30Z" };
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
function backend(initial: Reservation | null = null, alternativeSpots = [data.spots[0]]) {
  let reservation = initial;
  const fetch = vi.fn(async (url: string, options: RequestInit) => {
    if (url.includes("alternatives")) return { ok: true, json: async () => alternativeSpots };
    if (options?.method === "POST") {
      reservation = url.endsWith("reject") ? {...base,status:"DISPLACED"} : url.endsWith("confirm") ? {...base,status:"COMPLETED"} : base;
    }
    return { ok: true, json: async () => ({ reservation, serverTime: data.serverTime }) };
  });
  vi.stubGlobal("fetch", fetch);
  return { fetch, occupy: () => { reservation = {...base,status:"PENDING_CONFIRMATION"}; } };
}
it("reserva somente vaga comum e mostra o prazo recebido do servidor", async () => {
  const server = backend();
  render(<MobileReservations data={data} connected />);
  fireEvent.click(await screen.findByRole("button", {name:"A Livre"}));
  const button = await screen.findByRole("button", {name:"Reservar vaga A"});
  await act(async () => {});
  expect(screen.queryByRole("button",{name:"Reservar vaga PCD"})).not.toBeInTheDocument();
  fireEvent.click(button);
  expect(await screen.findByRole("timer")).toHaveTextContent("1:30");
  expect(server.fetch.mock.calls.some(([url,options]) => url.endsWith("/reservations") && options.credentials === "include")).toBe(true);
});
it("informa o bloqueio ao selecionar PCD sem enviar solicitação de reserva", async () => {
  const server = backend();
  render(<MobileReservations data={data} connected />);
  fireEvent.click(await screen.findByRole("button",{name:"PCD Livre Acessível"}));
  expect(screen.getByText("Não é possível reservar vagas destinadas a pessoas com deficiência (PCD).")).toBeInTheDocument();
  expect(screen.queryByRole("button",{name:"Reservar vaga PCD"})).not.toBeInTheDocument();
  expect(server.fetch.mock.calls.some(([,options]) => options?.method === "POST")).toBe(false);
});
it("não recomenda PCD mesmo que venha na lista de alternativas", async () => {
  backend({...base,status:"DISPLACED"},[data.spots[1],data.spots[0]]);
  render(<MobileReservations data={data} connected />);
  expect(await screen.findByRole("button",{name:"Aceitar vaga A"})).toBeInTheDocument();
  expect(screen.queryByRole("button",{name:"Aceitar vaga PCD"})).not.toBeInTheDocument();
});
it("informa ausência de alternativas quando restam somente vagas PCD", async () => {
  backend({...base,status:"DISPLACED"},[data.spots[1]]);
  render(<MobileReservations data={data} connected />);
  expect(await screen.findByText("Nenhuma alternativa disponível no momento.")).toBeInTheDocument();
  expect(screen.queryByRole("button",{name:"Aceitar vaga PCD"})).not.toBeInTheDocument();
});
it("recupera confirmação pendente e oferece alternativa somente depois da rejeição", async () => {
  backend({...base,status:"PENDING_CONFIRMATION"});
  render(<MobileReservations data={data} connected />);
  expect(await screen.findByRole("dialog")).toHaveTextContent("Foi você quem estacionou?");
  fireEvent.click(screen.getByRole("button",{name:"Não, não fui eu"}));
  expect(await screen.findByRole("button",{name:"Aceitar vaga A"})).toBeInTheDocument();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
it("confirma estacionamento e encerra a reserva no retorno do backend", async () => {
  backend({...base,status:"PENDING_CONFIRMATION"});
  render(<MobileReservations data={data} connected />);
  fireEvent.click(await screen.findByRole("button",{name:"Sim, fui eu"}));
  expect(await screen.findByText("Estacionamento confirmado")).toBeInTheDocument();
  expect(screen.queryByRole("timer")).not.toBeInTheDocument();
});
it("não mostra popup de outra sessão e informa conflito devolvido pelo servidor", async () => {
  backend();
  render(<MobileReservations data={data} connected />);
  await act(async () => {});
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  vi.stubGlobal("fetch",vi.fn(async (_url, options) => options.method === "POST"
    ? {ok:false,json:async()=>({message:"Vaga indisponível para reserva"})}
    : {ok:true,json:async()=>({reservation:null,serverTime:data.serverTime})}));
  fireEvent.click(screen.getByRole("button",{name:"A Livre"}));
  fireEvent.click(screen.getByRole("button",{name:"Reservar vaga A"}));
  expect(await screen.findByRole("alert")).toHaveTextContent("Vaga indisponível");
});
it("ao zerar o contador aguarda o backend e não conclui estacionamento sozinho", async () => {
  vi.useFakeTimers(); backend(base);
  render(<MobileReservations data={data} connected />);
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  expect(screen.getByRole("timer")).toHaveTextContent("1:30");
  // A consulta privada também acontece periodicamente. Aqui simulamos indisponibilidade após a leitura.
  vi.stubGlobal("fetch",vi.fn().mockRejectedValue(new Error("offline")));
  await act(async () => { await vi.advanceTimersByTimeAsync(91000); });
  expect(screen.getByRole("timer")).toHaveTextContent("0:00");
  expect(screen.getByText("Prazo atingido. Aguardando confirmação do servidor.")).toBeInTheDocument();
  expect(screen.queryByText("Estacionamento confirmado")).not.toBeInTheDocument();
});
it("remove avisos encerrados em 10s e não os restaura ao consultar ou recarregar", async () => {
  vi.useFakeTimers(); backend({...base,status:"DISPLACED"});
  const page = render(<MobileReservations data={data} connected />);
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  expect(screen.getByText("Outra pessoa ocupou sua vaga")).toBeInTheDocument();
  expect(screen.getByText("Alternativa próxima")).toBeInTheDocument();
  await act(async () => { await vi.advanceTimersByTimeAsync(10000); });
  expect(screen.queryByText("Outra pessoa ocupou sua vaga")).not.toBeInTheDocument();
  expect(screen.queryByText("Alternativa próxima")).not.toBeInTheDocument();
  await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
  expect(screen.queryByText("Outra pessoa ocupou sua vaga")).not.toBeInTheDocument();
  page.unmount();
  render(<MobileReservations data={data} connected />);
  await act(async () => { await vi.advanceTimersByTimeAsync(1); });
  expect(screen.queryByText("Outra pessoa ocupou sua vaga")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button",{name:"A Livre"}));
  expect(screen.getByRole("button",{name:"Reservar vaga A"})).toBeInTheDocument();
});
it("mantém a reserva ativa visível depois do prazo de aviso", async () => {
  vi.useFakeTimers(); backend(base);
  render(<MobileReservations data={data} connected />);
  await act(async () => { await vi.advanceTimersByTimeAsync(11000); });
  expect(screen.getByRole("timer")).toBeInTheDocument();
  expect(screen.getByRole("button",{name:"Cancelar reserva"})).toBeInTheDocument();
});
it("mobile apresenta o painel sem mapa ou seletor de visualização", async () => {
  vi.stubGlobal("fetch",vi.fn(async (url: string) => ({ok:true,json:async()=>url.includes("reservations")
    ? {reservation:null,serverTime:data.serverTime} : data})));
  render(<Dashboard mobile />);
  expect(await screen.findByRole("button",{name:"A Livre"})).toBeInTheDocument();
  expect(screen.queryByRole("group",{name:"Mapa das vagas nas posições do vídeo"})).not.toBeInTheDocument();
  expect(screen.queryByRole("button",{name:"Mapa"})).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Visualização")).not.toBeInTheDocument();
  expect(screen.queryByRole("link",{name:"Ver totem"})).not.toBeInTheDocument();
});
it("fecha a mensagem de indisponibilidade quando a vaga atualiza e não reabre seleção antiga", () => {
  const reserve = vi.fn();
  const occupied = {...data.spots[0],status:"OCCUPIED" as const};
  const page = render(<ParkingMap spots={[occupied]} panelOnly onReserve={reserve} />);
  fireEvent.click(screen.getByRole("button",{name:"A Ocupada"}));
  expect(screen.getByText("Vaga ocupada: indisponível para reserva.")).toBeInTheDocument();
  page.rerender(<ParkingMap spots={[data.spots[0]]} panelOnly onReserve={reserve} />);
  expect(screen.queryByText("Vaga ocupada: indisponível para reserva.")).not.toBeInTheDocument();
  expect(screen.queryByRole("button",{name:"Reservar vaga A"})).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button",{name:"A Livre"}));
  expect(screen.getByRole("button",{name:"Reservar vaga A"})).toBeInTheDocument();
  page.rerender(<ParkingMap spots={[{...data.spots[0],status:"RESERVED"}]} panelOnly onReserve={reserve} />);
  expect(screen.queryByText("Vaga reservada: indisponível para reserva.")).not.toBeInTheDocument();
  page.rerender(<ParkingMap spots={[data.spots[0]]} panelOnly onReserve={reserve} />);
  expect(screen.queryByRole("button",{name:"Reservar vaga A"})).not.toBeInTheDocument();
});
