export type Status = "FREE" | "OCCUPIED" | "UNKNOWN" | "RESERVED";
export interface Point {
  x: number;
  y: number;
}
export interface Spot {
  spotCode: string;
  status: Status;
  physicalStatus?: "FREE" | "OCCUPIED" | "UNKNOWN";
  sector: string;
  accessible: boolean;
  layoutOrder: number;
  polygon: Point[];
  lastObserved: string;
  lastUpdated: string;
}
export interface Summary {
  total: number;
  free: number;
  occupied: number;
  reserved: number;
  unknown: number;
  occupancyPercent?: number | null;
}
export interface Snapshot {
  spots: Spot[];
  summary: Summary;
  serverTime: string;
  lastObserved?: string;
  monitoringActive: boolean;
  version: number;
}
export const statusLabel: Record<Status, string> = {
  FREE: "Livre",
  OCCUPIED: "Ocupada",
  UNKNOWN: "Desconhecida",
  RESERVED: "Reservada",
};
export interface Reservation {
  id: string;
  spotCode: string;
  status: "ACTIVE" | "PENDING_CONFIRMATION" | "EXPIRED" | "COMPLETED" | "CANCELLED" | "DISPLACED";
  createdAt: string;
  expiresAt: string;
}
export interface PrivateSnapshot { reservation?: Reservation | null; serverTime: string }
