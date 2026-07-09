import { useState } from 'react'
import { generateAiPrompt } from './ai-prompts'
import type { GeneratedPrompt } from './ai-prompts'

interface HistoryEntry extends GeneratedPrompt {
  id: string
  instructions: string
}

const HISTORY_KEY = 'stock-tracker:prompt-history'

function readHistory(): HistoryEntry[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]') as unknown
    return Array.isArray(parsed) ? (parsed as HistoryEntry[]).slice(0, 10) : []
  } catch {
    return []
  }
}

export function AiInsights() {
  const [instructions, setInstructions] = useState('')
  const [generated, setGenerated] = useState<GeneratedPrompt | null>(null)
  const [editedPrompt, setEditedPrompt] = useState('')
  const [history, setHistory] = useState<HistoryEntry[]>(readHistory)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)

  async function generate() {
    setBusy(true)
    setMessage(null)
    try {
      const result = await generateAiPrompt(instructions)
      setGenerated(result)
      setEditedPrompt(result.prompt)
      const entry = {
        ...result,
        id: `${result.generatedAt}:${crypto.randomUUID()}`,
        instructions: instructions.trim(),
      }
      const nextHistory = [entry, ...history].slice(0, 10)
      setHistory(nextHistory)
      localStorage.setItem(HISTORY_KEY, JSON.stringify(nextHistory))
    } catch (error) {
      setMessage({ tone: 'error', text: error instanceof Error ? error.message : 'Could not generate the prompt.' })
    } finally {
      setBusy(false)
    }
  }

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(editedPrompt)
      setMessage({ tone: 'success', text: 'Prompt copied to the clipboard.' })
    } catch {
      setMessage({ tone: 'error', text: 'Clipboard access was denied. Select and copy the text manually.' })
    }
  }

  function openHistory(entry: HistoryEntry) {
    setGenerated(entry)
    setEditedPrompt(entry.prompt)
    setInstructions(entry.instructions)
    setMessage(null)
  }

  return (
    <main className="main-content ai-page">
      <header className="page-header">
        <div>
          <span className="section-kicker">Private prompt workspace</span>
          <h1>AI portfolio review</h1>
          <p>Build a grounded portfolio brief to use with the AI assistant of your choice.</p>
        </div>
        <span className="local-only-badge"><i /> Local generation</span>
      </header>

      {message && <div className={`operation-message operation-message--${message.tone}`} role="status">{message.text}</div>}

      <div className="ai-layout">
        <div className="ai-main">
          <section className="panel prompt-config">
            <div className="prompt-step"><span>1</span><div><h2>Guide the review</h2><p>Optional instructions are appended to the evidence-based review template.</p></div></div>
            <textarea rows={5} cols={50} value={instructions} maxLength={5000} onChange={(event) => setInstructions(event.target.value)} placeholder="For example: Focus on concentration, identify positions without clear exits, and challenge any inconsistent rationale." />
            <div className="prompt-config__footer"><small>{instructions.length.toLocaleString('en-IN')} / 5,000</small><button className="primary-button" disabled={busy} onClick={() => void generate()}>{busy ? 'Building prompt…' : generated ? 'Regenerate prompt' : 'Generate prompt'}</button></div>
          </section>

          <section className="panel prompt-editor">
            <div className="prompt-editor__heading">
              <div className="prompt-step"><span>2</span><div><h2>Review and customize</h2><p>Edit anything before copying it into an external AI.</p></div></div>
              {generated && <div className="prompt-actions"><button className="secondary-button" onClick={() => setEditedPrompt(generated.prompt)}>Reset edits</button><button className="primary-button" disabled={!editedPrompt} onClick={() => void copyPrompt()}>Copy prompt</button></div>}
            </div>
            {generated ? (
              <>
                <div className="context-chips"><span>{generated.context.holdingCount} holdings</span><span>{generated.context.activeExitPlanCount} exit plans</span><span>{generated.context.alertCount} alerts</span><span>{generated.context.closedLotCount} closed lots</span>{generated.context.warningCount > 0 && <span className="context-chip--warning">{generated.context.warningCount} data warnings</span>}</div>
                <textarea rows={5} cols={50} className="prompt-textarea" value={editedPrompt} onChange={(event) => setEditedPrompt(event.target.value)} spellCheck="false" />
              </>
            ) : (
              <div className="prompt-empty"><span>✦</span><strong>Your review prompt will appear here</strong><p>It will contain portfolio totals, holdings, exit plans, alerts, closed lots, and explicit data-quality caveats.</p></div>
            )}
          </section>
        </div>

        <aside className="panel prompt-history">
          <div className="prompt-history__heading"><span className="section-kicker">This browser only</span><h2>Recent prompts</h2></div>
          {history.length ? <div className="history-list">{history.map((entry) => <button key={entry.id} onClick={() => openHistory(entry)}><span><strong>{new Date(entry.generatedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</strong><small>{new Date(entry.generatedAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}</small></span><p>{entry.instructions || 'Standard portfolio review'}</p><small>{entry.context.holdingCount} holdings · {entry.context.alertCount} alerts</small></button>)}</div> : <div className="history-empty"><span>◷</span><p>Generated prompts will be saved here locally for quick reuse.</p></div>}
          <div className="privacy-note"><strong>No portfolio data is sent to an AI.</strong><p>Generation happens on your local Stock Tracker server. Data leaves only when you copy and paste it elsewhere.</p></div>
        </aside>
      </div>
    </main>
  )
}
