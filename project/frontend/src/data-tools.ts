export interface ImportResult {
  dryRun: boolean
  importedTrades: number
  createdAccounts: number
  createdInstruments: number
  warnings?: string[]
}
export interface BackupEntry {
  name: string
  size: number
  createdAt: string
}

export interface PriceRefreshStatus {
  enabled: boolean
  provider: string
  configured: boolean
  nextRunAt: string | null
  schedule: string
}

export interface PriceRefreshResult {
  trigger: 'MANUAL' | 'SCHEDULED'
  provider: string
  requestedInstruments: number
  storedPrices: number
  missingSymbols: string[]
  refreshedAt: string
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

export async function importIciciDirectTrades(file: File, dryRun: boolean) {

  const fileContent = await file.text();
  console.log('Importing ICICI Direct trades:', fileContent.length);

  const response = await fetch(`/api/data/icici-direct.csv?dryRun=${dryRun}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ csv: fileContent }),
  })
  if (!response.ok) throw await apiError(response)
  return (await response.json()) as ImportResult
}

export async function listBackups() {
  const response = await fetch('/api/backups')
  if (!response.ok) throw await apiError(response)
  return (await response.json()) as BackupEntry[]
}

export async function getPriceRefreshStatus() {
  const response = await fetch('/api/prices/refresh/eod')
  if (!response.ok) throw await apiError(response)
  return (await response.json()) as PriceRefreshStatus
}

export async function refreshPricesNow() {
  const response = await fetch('/api/prices/refresh/ltp', {
    method: 'POST',
  })
  if (!response.ok) throw await apiError(response)
  return (await response.json()) as PriceRefreshResult
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
