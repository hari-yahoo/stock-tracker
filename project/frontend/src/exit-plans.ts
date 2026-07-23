import type { TradeInstrumentOption } from "./trades";

export type ExitPlanStatus = "ACTIVE" | "COMPLETED" | "CANCELLED";

export interface StockExitPlan {
  id: string;
  instrumentId: string;
  targetDate: string;
  targetPrice: string;
  rationale: string;
  status: ExitPlanStatus;
  createdAt: string;
  updatedAt: string;
  instrument: TradeInstrumentOption;
}

async function apiError(response: Response) {
  try {
    const body = (await response.json()) as { message?: string | string[] };
    const message = Array.isArray(body.message)
      ? body.message.join(", ")
      : body.message;
    return new Error(message || `Request failed (${response.status})`);
  } catch {
    return new Error(`Request failed (${response.status})`);
  }
}

export async function getExitPlans(signal?: AbortSignal) {
  const response = await fetch("/api/exit-plans", { signal });
  if (!response.ok) throw await apiError(response);
  return (await response.json()) as StockExitPlan[];
}

export async function createExitPlan(input: {
  instrumentId: string;
  targetPrice: string;
  targetDate: string;
  rationale: string;
}) {
  const response = await fetch("/api/exit-plans", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw await apiError(response);
  return (await response.json()) as StockExitPlan;
}

export async function updateExitPlan(
  id: string,
  input: {
    targetPrice: string;
    targetDate: string;
    rationale: string;
    status: ExitPlanStatus;
  },
) {
  const response = await fetch(`/api/exit-plans/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw await apiError(response);
  return (await response.json()) as StockExitPlan;
}
