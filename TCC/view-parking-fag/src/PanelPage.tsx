import { ParkingMap } from "./ParkingMap";
import { useParking } from "./useParking";

export default function PanelPage() {
  const { data, updated, loading, connected } = useParking();
  return <main className="standalone-panel">
    {data?.spots.length ? <ParkingMap spots={data.spots} panelOnly /> : <section className="empty-state" aria-live="polite">
      <h1>{loading ? "Carregando painel" : data ? "Nenhuma vaga cadastrada" : "Aguardando monitoramento"}</h1>
    </section>}
    <p className="panel-updated">{updated && <>Atualizado às {new Date(updated).toLocaleTimeString("pt-BR", {timeZone:"America/Sao_Paulo"})} · Horário de Brasília</>}
      {(!connected || !data?.monitoringActive) && <> · Aguardando atualização do monitoramento</>}
    </p>
  </main>;
}
