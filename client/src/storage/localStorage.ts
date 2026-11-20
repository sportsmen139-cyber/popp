export class LocalStorageError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LocalStorageError'
  }
}

export function readRaw(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    throw new LocalStorageError('Не удалось открыть записи на этом устройстве. Разреши сохранение данных для приложения и попробуй снова.')
  }
}

export function writeRaw(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    throw new LocalStorageError('Не удалось сохранить данные на этом устройстве. Не закрывай тренировку: освободи место или разреши сохранение данных и повтори действие.')
  }
}

export function removeStored(key: string): void {
  try {
    localStorage.removeItem(key)
  } catch {
    throw new LocalStorageError('Сохранение ещё не завершено. Не закрывай приложение и повтори действие.')
  }
}

export function readStored<T>(key: string, validate: (value: unknown) => value is T, empty: T): T {
  const raw = readRaw(key)
  if (raw === null) return empty
  try {
    const value: unknown = JSON.parse(raw)
    if (validate(value)) return value
  } catch {
    // Keep the original bytes. Never replace unreadable history with an empty list.
  }
  throw new LocalStorageError('Не удалось прочитать сохранённые записи. Они не удалены. Не очищай данные приложения: обратись к владельцу alpha для восстановления.')
}

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

export const isNonNegativeNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0

export const isNonNegativeInteger = (value: unknown): value is number =>
  isNonNegativeNumber(value) && Number.isInteger(value)
