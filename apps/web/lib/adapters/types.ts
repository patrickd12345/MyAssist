import "server-only";

export type AdapterTodayInput = {
  now?: Date;
  timeZone?: string;
  limit?: number;
};

export interface LiveProviderAdapter<
  TTodayItem,
  TItem,
  TCreatePayload,
  TUpdatePayload,
> {
  getToday(input?: AdapterTodayInput): Promise<TTodayItem[]>;
  getById(id: string): Promise<TItem | null>;
  search(query: string, limit?: number): Promise<TItem[]>;
  create(payload: TCreatePayload): Promise<TItem>;
  update(id: string, payload: TUpdatePayload): Promise<TItem>;
  archive?(id: string): Promise<void>;
  complete?(id: string): Promise<void>;
}
