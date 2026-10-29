import { useCallback, useEffect, useRef, useState } from "react";
import { request } from "./api";
import { ParkingMap } from "./ParkingMap";
import type { PrivateSnapshot, Snapshot, Spot } from "./types";

export function MobileReservations({ data, connected }: { data: Snapshot | null; connected: boolean }) {
  const [privateData, setPrivateData] = useState<PrivateSnapshot | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [remaining, setRemaining] = useState(0);
  const [alternatives, setAlternatives] = useState<Spot[] | null>(null);
  const [dismissedNotice, setDismissedNotice] = useState("");
  const mounted = useRef(true);
  const newestServerTime = useRef(-Infinity);
  const sample = useRef({ time: 0, received: 0 });
  const accept = useCallback((value: PrivateSnapshot) => {
    if (!mounted.current) return;
    const time = Date.parse(value.serverTime);
    if (time < newestServerTime.current) return;
    newestServerTime.current = time;
    sample.current = { time, received: performance.now() };
    setRemaining(value.reservation ? Math.max(0,Math.ceil((Date.parse(value.reservation.expiresAt) - time) / 1000)) : 0);
    setPrivateData(value);
    setSessionReady(true);
  }, []);
  const refresh = useCallback(async () => {
    try { accept(await request<PrivateSnapshot>("/reservations/current")); }
    catch { if (mounted.current) setError("Não foi possível consultar sua reserva. Tentaremos novamente."); }
  }, [accept]);
  const signature = data?.spots.map(s => `${s.spotCode}:${s.status}`).join("|");
  useEffect(() => {
    mounted.current = true;
    void refresh();
    const interval = setInterval(() => void refresh(), 15000);
    const visible = () => { if (!document.hidden) void refresh(); };
    window.addEventListener("focus", visible); document.addEventListener("visibilitychange", visible);
    return () => { mounted.current = false; clearInterval(interval); window.removeEventListener("focus", visible); document.removeEventListener("visibilitychange", visible); };
  }, [refresh]);
  useEffect(() => { if (signature !== undefined) void refresh(); }, [signature, refresh]);
  const reservation = privateData?.reservation;
  const live = reservation?.status === "ACTIVE" || reservation?.status === "PENDING_CONFIRMATION";
  const terminalKey = reservation && !live ? `${reservation.id}:${reservation.status}` : null;
  useEffect(() => {
    if (!terminalKey) return;
    let until = Date.now() + 10000;
    try {
      const stored = JSON.parse(sessionStorage.getItem("parking-fag:last-notice") || "null");
      if (stored?.key === terminalKey && Number.isFinite(stored.until)) until = stored.until;
      sessionStorage.setItem("parking-fag:last-notice", JSON.stringify({ key: terminalKey, until }));
    } catch { /* Notice expiry still works when browser storage is unavailable. */ }
    if (until <= Date.now()) { setDismissedNotice(terminalKey); return; }
    const timer = setTimeout(() => setDismissedNotice(terminalKey), until - Date.now());
    return () => clearTimeout(timer);
  }, [terminalKey]);
  const showReservation = reservation && (live || dismissedNotice !== terminalKey);
  useEffect(() => {
    if (!reservation || !live) return;
    const tick = () => setRemaining(Math.max(0, Math.ceil((Date.parse(reservation.expiresAt) - sample.current.time - (performance.now() - sample.current.received)) / 1000)));
    tick(); const timer = setInterval(tick, 250);
    return () => clearInterval(timer);
  }, [reservation, live]);
  useEffect(() => {
    if (reservation?.status !== "DISPLACED") { setAlternatives([]); return; }
    setAlternatives(null);
    let active = true;
    request<Spot[]>(`/parking-spots/alternatives?from=${encodeURIComponent(reservation.spotCode)}`)
      .then(spots => { if (active) setAlternatives(spots.filter(spot => !spot.accessible && spot.status === "FREE")); })
      .catch(() => { if (active) setError("Não foi possível buscar alternativas. Consulte as vagas disponíveis abaixo."); });
    return () => { active = false; };
  }, [reservation?.status, reservation?.spotCode]);
  async function operate(path: string, body: unknown = {}) {
    if (busy) return;
    setBusy(true); setError("");
    try { accept(await request<PrivateSnapshot>(path, body)); }
    catch (e) { if (mounted.current) setError(e instanceof Error ? e.message : "Não foi possível concluir a operação"); await refresh(); }
    finally { if (mounted.current) setBusy(false); }
  }
  const available = data?.spots.filter(s => s.status === "FREE" && !s.accessible) || [];
  return <section className="reservations" aria-label="Reservas pelo celular">
    {error && <p className="error" role="alert">{error}</p>}
    {showReservation && <article className="reservation-card">
      <h2>{live ? "Sua reserva" : "Última reserva"} · {reservation.spotCode}</h2>
      {live ? <><p className="timer" role="timer" aria-label="Tempo restante">{Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2,"0")}</p>
        <p>{remaining > 0 ? "Dirija-se à vaga antes do fim do prazo." : "Prazo atingido. Aguardando confirmação do servidor."}</p>
        <button disabled={busy} onClick={() => void operate(`/reservations/${reservation.id}/cancel`)}>Cancelar reserva</button>
      </> : <p>{({ EXPIRED: "Reserva expirada", COMPLETED: "Estacionamento confirmado", CANCELLED: "Reserva cancelada", DISPLACED: "Outra pessoa ocupou sua vaga" } as Record<string,string>)[reservation.status]}</p>}
    </article>}
    {reservation?.status === "PENDING_CONFIRMATION" && <div className="dialog-backdrop"><section className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="confirm-title"
      onKeyDown={event => {
        if (event.key !== "Tab") return;
        const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"));
        if (!buttons.length) { event.preventDefault(); return; }
        if (event.shiftKey && document.activeElement === buttons[0]) { event.preventDefault(); buttons.at(-1)?.focus(); }
        else if (!event.shiftKey && document.activeElement === buttons.at(-1)) { event.preventDefault(); buttons[0].focus(); }
      }}>
      <h2 id="confirm-title">Confirme seu estacionamento</h2>
      <p>Um veículo foi identificado na vaga que você reservou. Foi você quem estacionou?</p>
      <button autoFocus disabled={busy} onClick={() => void operate(`/reservations/${reservation.id}/confirm`)}>Sim, fui eu</button>
      <button disabled={busy} onClick={() => void operate(`/reservations/${reservation.id}/reject`)}>Não, não fui eu</button>
    </section></div>}
    {showReservation && !live && reservation?.status === "DISPLACED" && <article className="reservation-card"><h2>Alternativa próxima</h2>
      {alternatives === null ? <p>Buscando alternativa disponível…</p> : alternatives.length ? <><p>Vaga {alternatives[0].spotCode} · proximidade estimada pelo mapa do vídeo.</p>
        <button disabled={busy || !connected} onClick={() => void operate("/reservations", { spotCode: alternatives[0].spotCode })}>Aceitar vaga {alternatives[0].spotCode}</button></>
        : <p>Nenhuma alternativa disponível no momento.</p>}
    </article>}
    {!live && <><h2>Escolha uma vaga livre</h2><p>Toque em uma vaga verde no painel e depois em “Reservar vaga”. A reserva dura 90 segundos.</p>
      {!available.length && <p>Nenhuma vaga comum disponível para reserva.</p>}</>}
    {!!data?.spots.length && <ParkingMap spots={data.spots} panelOnly
      onReserve={spotCode => void operate("/reservations", { spotCode })}
      reservationDisabled={busy || !!live || !connected || !sessionReady || !data.monitoringActive} />}
  </section>;
}
