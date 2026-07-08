import { type FormEvent, useEffect, useState } from 'react'
import { deleteIciciSymbolMapping, listIciciSymbolMappings, saveIciciSymbolMapping } from './symbol-mappings'
import type { IciciSymbolMapping } from './symbol-mappings'

export function SymbolMappingsScreen() {
  const [mappings, setMappings] = useState<IciciSymbolMapping[]>([])
  const [iciciSymbol, setIciciSymbol] = useState('')
  const [nseSymbol, setNseSymbol] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)

  async function load() {
    try { setMappings(await listIciciSymbolMappings()) }
    catch (error) { setMessage({ tone: 'error', text: error instanceof Error ? error.message : 'Could not load mappings.' }) }
  }

  useEffect(() => {
    void listIciciSymbolMappings()
      .then(setMappings)
      .catch((error: unknown) => setMessage({ tone: 'error', text: error instanceof Error ? error.message : 'Could not load mappings.' }))
  }, [])

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setMessage(null)
    try {
      await saveIciciSymbolMapping({ iciciSymbol: iciciSymbol.trim(), nseSymbol: nseSymbol.trim(), ...(companyName.trim() ? { companyName: companyName.trim() } : {}) })
      setIciciSymbol('')
      setNseSymbol('')
      setCompanyName('')
      await load()
      setMessage({ tone: 'success', text: 'Symbol mapping saved.' })
    } catch (error) {
      setMessage({ tone: 'error', text: error instanceof Error ? error.message : 'Could not save mapping.' })
    } finally { setBusy(false) }
  }

  async function remove(mapping: IciciSymbolMapping) {
    if (!window.confirm(`Remove the mapping for ${mapping.iciciSymbol}?`)) return
    setBusy(true)
    setMessage(null)
    try {
      await deleteIciciSymbolMapping(mapping.id)
      await load()
      setMessage({ tone: 'success', text: 'Symbol mapping removed.' })
    } catch (error) {
      setMessage({ tone: 'error', text: error instanceof Error ? error.message : 'Could not remove mapping.' })
    } finally { setBusy(false) }
  }

  return (
    <main className="main-content mappings-page">
      <header className="page-header"><div><span className="section-kicker">ICICIDirect compatibility</span><h1>Symbol mappings</h1><p>Translate ICICIDirect’s six-letter broker codes into the NSE symbols used for price retrieval.</p></div></header>
      {message && <div className={`operation-message operation-message--${message.tone}`} role="status">{message.text}</div>}
      <section className="panel mapping-panel">
        <form className="mapping-form" onSubmit={(event) => void submit(event)}>
          <label className="search-field">ICICIDirect symbol<input value={iciciSymbol} onChange={(event) => setIciciSymbol(event.target.value.toUpperCase())} placeholder="e.g. HINUNI" maxLength={32} required /></label>
          <label className="search-field">NSE symbol<input value={nseSymbol} onChange={(event) => setNseSymbol(event.target.value.toUpperCase())} placeholder="e.g. HINDUNILVR" maxLength={32} required /></label>
          <label className="search-field">Company name <small>optional</small><input value={companyName} onChange={(event) => setCompanyName(event.target.value)} placeholder="Hindustan Unilever Limited" maxLength={200} /></label>
          <button className="primary-button" disabled={busy || !iciciSymbol.trim() || !nseSymbol.trim()}>{busy ? 'Saving…' : 'Save mapping'}</button>
        </form>
        <div className="table-scroll mapping-table-wrap">
          <table className="mapping-table">
            <thead><tr><th>ICICIDirect symbol</th><th>NSE price symbol</th><th>Company</th><th aria-label="Actions" /></tr></thead>
            <tbody>
              {mappings.map((mapping) => <tr key={mapping.id}><td><strong>{mapping.iciciSymbol}</strong></td><td><span className="mapping-arrow">→</span><strong>{mapping.nseSymbol}</strong></td><td>{mapping.companyName ?? '—'}</td><td><button type="button" className="mapping-delete" disabled={busy} onClick={() => void remove(mapping)}>Remove</button></td></tr>)}
              {!mappings.length && <tr><td colSpan={4} className="mapping-empty">No mappings yet. Add one above before refreshing ICICIDirect holding prices.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  )
}
