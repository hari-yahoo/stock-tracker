export interface ImportResult {
  dryRun: boolean
  importedTrades: number
  createdAccounts: number
  createdInstruments: number
}

export interface BackupEntry {
  name: string
  size: number
  createdAt: string
}

async function apiError(response: Response): Promise<Error> {
  try {
    const body = (await response.json()) as { message?: string | string[] }
    const message = Array.isArray(body.message) ? body.message.join(', ') : body.message
    return new Error(message || `Request failed (${response.status})`)
  } catch {
    return new Error(`Request failed (${response.status})`)
  }
}

export async function importTrades(file: File, dryRun: boolean) {
  const response = await fetch(`/api/data/trades.csv?dryRun=${dryRun}`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/csv' },
    body: await file.text(),
  })
  if (!response.ok) throw await apiError(response)
  return (await response.json()) as ImportResult
}

export async function listBackups() {
  const response = await fetch('/api/backups')
  if (!response.ok) throw await apiError(response)
  return (await response.json()) as BackupEntry[]
}

export async function createBackup(label?: string) {
  const response = await fetch('/api/backups', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(label ? { label } : {}),
  })
  if (!response.ok) throw await apiError(response)
  return (await response.json()) as BackupEntry
}

export async function restoreBackup(file: File) {
  const response = await fetch('/api/backups/restore', {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: file,
  })
  if (!response.ok) throw await apiError(response)
  return (await response.json()) as { restored: boolean; rollbackBackup: string }
}
