export type ProductId = "myassist";

export type SessionBoundaryPayload = {
  summary: string;
  next_actions: string[];
  newlyActiveWork: string[];
  in_progress: string[];
};

export type PersistentMemoryState = {
  lastCommitted: SessionBoundaryPayload | null;
  history: SessionBoundaryPayload[];
};

export type PersistentSessionHandle = {
  product: ProductId;
  tenantKey: string;
  memory: PersistentMemoryState;
};

const STORE = new Map<string, PersistentMemoryState>();

function storeKey(product: ProductId, tenantKey: string): string {
  return `${product}:${tenantKey}`;
}

export function emptySessionBoundaryPayload(summary = ""): SessionBoundaryPayload {
  return {
    summary,
    next_actions: [],
    newlyActiveWork: [],
    in_progress: [],
  };
}

export async function startSession(
  product: ProductId,
  tenantKey: string,
): Promise<PersistentSessionHandle> {
  const key = storeKey(product, tenantKey);
  const existing = STORE.get(key);
  if (existing) {
    return {
      product,
      tenantKey,
      memory: {
        lastCommitted: existing.lastCommitted,
        history: [...existing.history],
      },
    };
  }

  const fresh: PersistentMemoryState = {
    lastCommitted: null,
    history: [],
  };
  STORE.set(key, fresh);
  return {
    product,
    tenantKey,
    memory: {
      lastCommitted: fresh.lastCommitted,
      history: [...fresh.history],
    },
  };
}

export async function commitSessionBoundary(
  handle: PersistentSessionHandle,
  payload: SessionBoundaryPayload,
): Promise<void> {
  const key = storeKey(handle.product, handle.tenantKey);
  const current = STORE.get(key) ?? { lastCommitted: null, history: [] };
  const next: PersistentMemoryState = {
    lastCommitted: payload,
    history: [...current.history, payload].slice(-20),
  };
  STORE.set(key, next);

  handle.memory.lastCommitted = next.lastCommitted;
  handle.memory.history = [...next.history];
}
