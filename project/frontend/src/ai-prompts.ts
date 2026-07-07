export interface GeneratedPrompt {
  prompt: string
  generatedAt: string
  context: {
    holdingCount: number
    activeExitPlanCount: number
    alertCount: number
    closedLotCount: number
    warningCount: number
  }
}

export async function generateAiPrompt(additionalInstructions: string) {
  const response = await fetch('/api/ai-prompts/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      reportingCurrency: 'INR',
      additionalInstructions: additionalInstructions.trim() || undefined,
    }),
  })
  if (!response.ok) {
    let message = `Prompt generation failed (${response.status}).`
    try {
      const body = (await response.json()) as { message?: string | string[] }
      message = Array.isArray(body.message)
        ? body.message.join(', ')
        : body.message || message
    } catch {
      // Keep the status-based message when the response is not JSON.
    }
    throw new Error(message)
  }
  return (await response.json()) as GeneratedPrompt
}
