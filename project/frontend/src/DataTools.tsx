import { useCallback, useEffect, useRef, useState } from 'react'
import {
  createBackup,
  importTrades,
  listBackups,
  restoreBackup,
} from './data-tools'
import type { BackupEntry, ImportResult } from './data-tools'

function fileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function DataTools({ onDataChanged }: { onDataChanged: () => void }) {
  const [csvFile, setCsvFile] = useState<File | null>(null)
  const [restoreFile, setRestoreFile] = useState<File | null>(null)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [backups, setBackups] = useState<BackupEntry[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)
  const restoreInput = useRef<HTMLInputElement>(null)

  const refreshBackups = useCallback(async () => {
    try {
      setBackups(await listBackups())
    } catch (error) {
      setMessage({ tone: 'error', text: error instanceof Error ? error.message : 'Could not list backups.' })
    }
  }, [])

  useEffect(() => {
    void listBackups().then(setBackups).catch(() => undefined)
  }, [])

  async function runImport(dryRun: boolean) {
    if (!csvFile) return
    setBusy(dryRun ? 'validate' : 'import')
    setMessage(null)
    try {
      const result = await importTrades(csvFile, dryRun)
      setImportResult(result)
      setMessage({
        tone: 'success',
        text: dryRun
          ? `Validation passed for ${result.importedTrades} trade rows. No data was changed.`
          : `Imported ${result.importedTrades} trades successfully.`,
      })
      if (!dryRun) onDataChanged()
    } catch (error) {
      setImportResult(null)
      setMessage({ tone: 'error', text: error instanceof Error ? error.message : 'Import failed.' })
    } finally {
      setBusy(null)
    }
  }

  async function makeBackup() {
    setBusy('backup')
    setMessage(null)
    try {
      const backup = await createBackup()
      setMessage({ tone: 'success', text: `Created ${backup.name}.` })
      await refreshBackups()
    } catch (error) {
      setMessage({ tone: 'error', text: error instanceof Error ? error.message : 'Backup failed.' })
    } finally {
      setBusy(null)
    }
  }

  async function restore() {
    if (!restoreFile) return
    if (!window.confirm('Restore this database? A rollback backup will be created first.')) return
    setBusy('restore')
    setMessage(null)
    try {
      const result = await restoreBackup(restoreFile)
      setMessage({ tone: 'success', text: `Restore complete. Rollback copy: ${result.rollbackBackup}.` })
      setRestoreFile(null)
      if (restoreInput.current) restoreInput.current.value = ''
      await refreshBackups()
      onDataChanged()
    } catch (error) {
      setMessage({ tone: 'error', text: error instanceof Error ? error.message : 'Restore failed.' })
    } finally {
      setBusy(null)
    }
  }

  return (
    <main className="main-content data-page">
      <header className="page-header">
        <div>
          <span className="section-kicker">Local data controls</span>
          <h1>Data & backups</h1>
          <p>Move your trades safely and keep recoverable copies of the complete portfolio.</p>
        </div>
      </header>

      {message && <div className={`operation-message operation-message--${message.tone}`} role="status">{message.text}</div>}

      <div className="data-tools-grid">
        <section className="panel tool-card">
          <div className="tool-card__heading"><span>CSV</span><h2>Import trades</h2><p>Validate first, then import every row in one transaction.</p></div>
          <label className="file-drop">
            <input type="file" accept=".csv,text/csv" onChange={(event) => { setCsvFile(event.target.files?.[0] ?? null); setImportResult(null) }} />
            <span className="file-drop__icon">⇧</span>
            <strong>{csvFile ? csvFile.name : 'Choose a CSV file'}</strong>
            <small>{csvFile ? fileSize(csvFile.size) : 'Stock Tracker CSV format · up to 10 MB'}</small>
          </label>
          {importResult && <div className="import-summary"><span><strong>{importResult.importedTrades}</strong> trades</span><span><strong>{importResult.createdAccounts}</strong> accounts</span><span><strong>{importResult.createdInstruments}</strong> instruments</span></div>}
          <div className="tool-actions">
            <button className="secondary-button" disabled={!csvFile || busy !== null} onClick={() => void runImport(true)}>{busy === 'validate' ? 'Validating…' : 'Validate only'}</button>
            <button className="primary-button" disabled={!csvFile || busy !== null} onClick={() => void runImport(false)}>{busy === 'import' ? 'Importing…' : 'Import trades'}</button>
          </div>
        </section>

        <section className="panel tool-card">
          <div className="tool-card__heading"><span>CSV</span><h2>Export trades</h2><p>Download posted trades in a portable, allocation-aware format.</p></div>
          <div className="tool-illustration"><span>BUY</span><i>→</i><span>SELL</span></div>
          <a className="primary-button button-link" href="/api/data/trades.csv" download>Download trades CSV</a>
        </section>

        <section className="panel tool-card tool-card--wide">
          <div className="tool-card__heading"><span>SQLite</span><h2>Database backup</h2><p>A consistent snapshot includes accounts, prices, plans, allocations, and full history.</p></div>
          <div className="backup-actions">
            <button className="primary-button" disabled={busy !== null} onClick={() => void makeBackup()}>{busy === 'backup' ? 'Creating…' : 'Create local backup'}</button>
            <a className="secondary-button button-link" href="/api/backups/download" download>Download snapshot</a>
          </div>
          <div className="backup-list">
            <div className="backup-list__title"><strong>Recent local backups</strong><span>{backups.length}</span></div>
            {backups.length ? backups.slice(0, 5).map((backup) => <div className="backup-row" key={backup.name}><span><strong>{backup.name}</strong><small>{new Date(backup.createdAt).toLocaleString('en-IN')}</small></span><span>{fileSize(backup.size)}</span></div>) : <p className="backup-empty">No local backups yet.</p>}
          </div>
        </section>

        <section className="panel tool-card tool-card--danger">
          <div className="tool-card__heading"><span>Restore</span><h2>Restore database</h2><p>The file is integrity-checked before any data is replaced.</p></div>
          <label className="compact-file"><input ref={restoreInput} type="file" accept=".sqlite,.db,application/vnd.sqlite3,application/octet-stream" onChange={(event) => setRestoreFile(event.target.files?.[0] ?? null)} /><span>{restoreFile?.name ?? 'Choose SQLite backup'}</span></label>
          <button className="danger-button" disabled={!restoreFile || busy !== null} onClick={() => void restore()}>{busy === 'restore' ? 'Restoring…' : 'Restore selected backup'}</button>
          <small className="safety-note">A pre-restore rollback snapshot is created automatically.</small>
        </section>
      </div>
    </main>
  )
}
