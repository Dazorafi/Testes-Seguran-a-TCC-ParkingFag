import { ParkingMap } from "./ParkingMap";
import { MobileReservations } from "./MobileReservations";
import { useParking } from "./useParking";

export function Dashboard({ mobile = false }: { mobile?: boolean }) {
  const { data, updated, loading, connected } = useParking();
  return <main className={mobile ? "mobile-page" : "totem-page"}>
    <header className="operation-header"><div><span className="eyebrow">PARKING FAG</span>
      <h1>{mobile ? "Reserve sua vaga" : "Vagas do estacionamento"}</h1></div>
    </header>
    <p className="connection" role="status">{connected && data?.monitoringActive ? "Monitoramento ativo" : "Monitoramento indisponível · aguardando atualização"}</p>
    {data && <section className="counts" aria-label="Resumo das vagas">
      {([ ["Livres", data.summary.free, "free"], ["Ocupadas", data.summary.occupied, "occupied"],
        ["Reservadas", data.summary.reserved, "reserved"], ["Desconhecidas", data.summary.unknown, "unknown"] ] as const)
        .map(([label, count, style]) => <div className={`count ${style}`} key={label}><strong>{count}</strong><span>{label}</span></div>)}
    </section>}
    {data?.summary.occupancyPercent != null && <p className="occupancy">{data.summary.occupancyPercent}% de ocupação das vagas conhecidas</p>}
    {mobile && <MobileReservations data={data} connected={connected} />}
    {data?.spots.length ? !mobile && <ParkingMap spots={data.spots} panelOnly /> : <section className="empty-state">
      <h2>{loading ? "Carregando painel" : data ? "Nenhuma vaga cadastrada" : "Aguardando monitoramento"}</h2>
    </section>}
    <footer>Atualizado às {updated ? new Date(updated).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—"} · Horário de Brasília
      {data && <> · Versão {data.version}</>}
    </footer>
  </main>;
}
