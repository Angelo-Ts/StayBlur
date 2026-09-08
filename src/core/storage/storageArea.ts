export interface StorageAreaLike {
  get<T = unknown>(keys: string | string[] | Record<string, unknown>): Promise<T>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
}

export class InMemoryStorageArea implements StorageAreaLike {
  private readonly state = new Map<string, unknown>();

  async get<T = unknown>(keys: string | string[] | Record<string, unknown>): Promise<T> {
    if (typeof keys === 'string') {
      return { [keys]: this.state.get(keys) } as T;
    }

    if (Array.isArray(keys)) {
      const result: Record<string, unknown> = {};
      for (const key of keys) {
        result[key] = this.state.get(key);
      }
      return result as T;
    }

    const result: Record<string, unknown> = {};
    for (const [key, fallback] of Object.entries(keys)) {
      result[key] = this.state.has(key) ? this.state.get(key) : fallback;
    }

    return result as T;
  }

  async set(items: Record<string, unknown>): Promise<void> {
    for (const [key, value] of Object.entries(items)) {
      this.state.set(key, value);
    }
  }

  async remove(keys: string | string[]): Promise<void> {
    const normalized = Array.isArray(keys) ? keys : [keys];

    for (const key of normalized) {
      this.state.delete(key);
    }
  }
}
