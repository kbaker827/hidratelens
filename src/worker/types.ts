export type IntakePayload = {
  date: string;
  totalMl: number;
  goalMl: number;
  lastDrinkAt: string | null;
  tz: string;
};

export type Snapshot = IntakePayload & { syncedAt: string };

export interface Env {
  HIDRATELENS: KVNamespace;
  WRITE_TOKEN: string;
  READ_TOKEN: string;
  ASSETS: Fetcher;
}
