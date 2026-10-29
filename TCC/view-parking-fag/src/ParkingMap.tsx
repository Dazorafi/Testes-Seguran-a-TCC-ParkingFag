import { useEffect, useState } from "react";
import type { Spot } from "./types";
import { statusLabel } from "./types";

export function ParkingMap({
  spots,
  panelOnly = false,
  onReserve,
  reservationDisabled = false,
}: {
  spots: Spot[];
  panelOnly?: boolean;
  onReserve?: (spotCode: string) => void;
  reservationDisabled?: boolean;
}) {
  const [selection, setSelection] = useState<{code: string; status: string; updated: string; accessible: boolean} | null>(null);
  const selected = spots.find(s => s.spotCode === selection?.code && s.status === selection.status
    && s.lastUpdated === selection.updated && s.accessible === selection.accessible) || null;
  const selectedCode = selected?.spotCode || null;
  function setSelectedCode(code: string | null) {
    const spot = spots.find(s => s.spotCode === code);
    setSelection(spot ? { code: spot.spotCode, status: spot.status, updated: spot.lastUpdated, accessible: spot.accessible } : null);
  }
  useEffect(() => {
    if (selection && !selected) setSelection(null);
  }, [selection, selected]);
  const [mode, setMode] = useState<"map" | "panel">("map");
  const sectors = [...new Set(spots.map((s) => s.sector))].sort();
  return (
    <section
      className="map-card"
      aria-labelledby={panelOnly ? undefined : "map-title"}
      aria-label={panelOnly ? "Painel de vagas" : undefined}
    >
      {!panelOnly && (
        <div className="card-heading">
          <div>
            <span className="eyebrow">VISÃO DO ESTACIONAMENTO</span>
            <h2 id="map-title">Encontre sua vaga</h2>
          </div>
          <div className="view-switch" aria-label="Visualização">
            <button
              className={mode === "map" ? "active" : ""}
              onClick={() => setMode("map")}
              aria-pressed={mode === "map"}
            >
              Mapa
            </button>
            <button
              className={mode === "panel" ? "active" : ""}
              onClick={() => setMode("panel")}
              aria-pressed={mode === "panel"}
            >
              Painel
            </button>
          </div>
        </div>
      )}
      <div className="map-body">
        {!panelOnly && mode === "map" ? (
          <svg
            className="physical-map"
            viewBox="280 235 1530 780"
            role="group"
            aria-label="Mapa das vagas nas posições do vídeo"
          >
            <defs>
              <pattern
                id="road-lines"
                width="95"
                height="8"
                patternUnits="userSpaceOnUse"
              >
                <rect width="46" height="4" fill="#e0b965" />
              </pattern>
            </defs>
            <rect
              x="280"
              y="235"
              width="1530"
              height="780"
              rx="20"
              fill="#edf0e9"
            />
            <rect
              x="295"
              y="488"
              width="1485"
              height="115"
              rx="22"
              fill="#dce1d8"
            />
            <rect
              x="320"
              y="540"
              width="1430"
              height="8"
              fill="url(#road-lines)"
            />
            <text className="road-label" x="1060" y="580" textAnchor="middle">
              CORREDOR DE CIRCULAÇÃO →
            </text>
            {spots.map((spot) => {
              const x =
                spot.polygon.reduce((sum, p) => sum + p.x * 1920, 0) /
                spot.polygon.length;
              const y =
                spot.polygon.reduce((sum, p) => sum + p.y * 1080, 0) /
                spot.polygon.length;
              const label = `${spot.spotCode} · ${statusLabel[spot.status]}${spot.accessible ? " · Acessível" : ""}`;
              return (
                <g
                  key={spot.spotCode}
                  role="button"
                  tabIndex={0}
                  aria-label={label}
                  onClick={() => setSelectedCode(spot.spotCode)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSelectedCode(spot.spotCode);
                    }
                  }}
                  className={`map-spot ${spot.status.toLowerCase()} ${selected?.spotCode === spot.spotCode ? "selected" : ""}`}
                >
                  <title>{label}</title>
                  <polygon
                    points={spot.polygon
                      .map((p) => `${p.x * 1920},${p.y * 1080}`)
                      .join(" ")}
                  />
                  <text
                    x={x}
                    y={y - (spot.accessible ? 9 : 0)}
                    textAnchor="middle"
                  >
                    {spot.spotCode}
                  </text>
                  <text
                    className="spot-status"
                    x={x}
                    y={y + (spot.accessible ? 38 : 27)}
                    textAnchor="middle"
                  >
                    {spot.accessible ? "♿ " : ""}
                    {statusLabel[spot.status]}
                  </text>
                </g>
              );
            })}
            <text className="sector-label" x="305" y="310">
              A
            </text>
            <text className="sector-label" x="305" y="725">
              B
            </text>
          </svg>
        ) : (
          <div className="totem-grid">
            {sectors.map((sector) => (
              <section key={sector} className="totem-sector">
                <h3>Setor {sector}</h3>
                <div className="totem-spots">
                  {spots
                    .filter((s) => s.sector === sector)
                    .sort((a, b) => a.layoutOrder - b.layoutOrder)
                    .map((spot) => (
                      <div className="panel-spot" key={spot.spotCode}>
                      <button
                        className={`totem-spot ${spot.status.toLowerCase()}`}
                        aria-expanded={onReserve ? selectedCode === spot.spotCode : undefined}
                        onClick={() => setSelectedCode(spot.spotCode)}
                        aria-label={`${spot.spotCode} ${statusLabel[spot.status]}${spot.accessible ? " Acessível" : ""}`}
                      >
                        <span>{spot.spotCode}</span>
                        <span>
                          {spot.accessible && "♿ "}
                          {statusLabel[spot.status]}
                        </span>
                      </button>
                      {onReserve && selectedCode === spot.spotCode && <div className="inline-reservation">
                        {spot.accessible ? <p role="status">Não é possível reservar vagas destinadas a pessoas com deficiência (PCD).</p>
                          : spot.status === "FREE" ? <button className="reserve-spot" disabled={reservationDisabled}
                            aria-label={`Reservar vaga ${spot.spotCode}`}
                            onClick={() => onReserve(spot.spotCode)}>Reservar vaga</button>
                          : <p>Vaga {statusLabel[spot.status].toLowerCase()}: indisponível para reserva.</p>}
                      </div>}
                      </div>
                    ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
      <div className="map-footer">
        <div className="legend">
          <span>
            <i className="free" />
            Livre
          </span>
          <span>
            <i className="occupied" />
            Ocupada
          </span>
          <span>
            <i className="unknown" />
            Desconhecida
          </span>
          <span className="accessible-label">♿ Acessível</span>
          <span><i className="reserved" />Reservada</span>
        </div>
        <span>Posições do vídeo</span>
      </div>
      {selected && !onReserve && (
        <div className="spot-detail" role="status">
          <strong>Vaga {selected.spotCode}</strong>
          <span>
            {statusLabel[selected.status]} · Setor {selected.sector}
            {selected.accessible
              ? " · Reservada para pessoa com deficiência"
              : ""}
          </span>
          <button
            onClick={() => setSelectedCode(null)}
            aria-label="Fechar detalhes da vaga"
          >
            ×
          </button>
        </div>
      )}
    </section>
  );
}
