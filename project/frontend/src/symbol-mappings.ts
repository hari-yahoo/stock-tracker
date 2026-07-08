export interface IciciSymbolMapping {
  id: string
  iciciSymbol: string
  nseSymbol: string
  companyName: string | null
  createdAt: string
  updatedAt: string
}

async function apiError(response: Response) {
  try {
    const body = (await response.json()) as { message?: string | string[] }
    const message = Array.isArray(body.message) ? body.message.join(', ') : body.message
    return new Error(message || `Request failed (${response.status})`)
  } catch {
    return new Error(`Request failed (${response.status})`)
  }
}

export async function listIciciSymbolMappings() {
  const response = await fetch('/api/instruments/icici-symbol-mappings')
  if (!response.ok) throw await apiError(response)
  return (await response.json()) as IciciSymbolMapping[]
}

export async function saveIciciSymbolMapping(input: { iciciSymbol: string; nseSymbol: string; companyName?: string }) {
  const response = await fetch('/api/instruments/icici-symbol-mappings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!response.ok) throw await apiError(response)
  return (await response.json()) as IciciSymbolMapping
}

export async function deleteIciciSymbolMapping(id: string) {
  const response = await fetch(`/api/instruments/icici-symbol-mappings/${id}`, { method: 'DELETE' })
  if (!response.ok) throw await apiError(response)
}
