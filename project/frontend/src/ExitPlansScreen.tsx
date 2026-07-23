import { type FormEvent, useEffect, useMemo, useState } from "react";
import { createExitPlan, getExitPlans, updateExitPlan } from "./exit-plans";
import type { ExitPlanStatus, StockExitPlan } from "./exit-plans";
import { formatDate, formatMoney } from "./portfolio-format";
import { getTradeInstruments } from "./trades";
import type { TradeInstrumentOption } from "./trades";

function toApiDate(date: string) {
  return new Date(`${date}T12:00:00`).toISOString();
}

function PlanForm({
  plan,
  instruments,
  onSaved,
  onCancel,
}: {
  plan: StockExitPlan | null;
  instruments: TradeInstrumentOption[];
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [instrumentId, setInstrumentId] = useState(plan?.instrumentId ?? "");
  const [targetPrice, setTargetPrice] = useState(plan?.targetPrice ?? "");
  const [targetDate, setTargetDate] = useState(
    plan?.targetDate.slice(0, 10) ?? "",
  );
  const [rationale, setRationale] = useState(plan?.rationale ?? "");
  const [status, setStatus] = useState<ExitPlanStatus>(
    plan?.status ?? "ACTIVE",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (plan) {
        await updateExitPlan(plan.id, {
          targetPrice,
          targetDate: toApiDate(targetDate),
          rationale,
          status,
        });
      } else {
        await createExitPlan({
          instrumentId,
          targetPrice,
          targetDate: toApiDate(targetDate),
          rationale,
        });
      }
      onSaved();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not save exit plan.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel stock-plan-editor">
      <div className="panel-heading">
        <div>
          <span className="section-kicker">
            {plan ? "Edit strategy" : "New strategy"}
          </span>
          <h2>{plan ? plan.instrument.symbol : "Add stock exit plan"}</h2>
        </div>
        <button type="button" className="secondary-button" onClick={onCancel}>
          Close
        </button>
      </div>
      <form
        className="stock-plan-form"
        onSubmit={(event) => void submit(event)}
      >
        {!plan && (
          <label className="filter-field">
            <span>Stock</span>
            <select
              value={instrumentId}
              onChange={(event) => setInstrumentId(event.target.value)}
              required
            >
              <option value="">Select stock</option>
              {instruments.map((instrument) => (
                <option key={instrument.id} value={instrument.id}>
                  {instrument.symbol}
                  {instrument.name ? ` · ${instrument.name}` : ""}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="search-field">
          <span>Target price</span>
          <input
            type="number"
            min="0"
            step="0.000001"
            value={targetPrice}
            onChange={(event) => setTargetPrice(event.target.value)}
            required
          />
        </label>
        <label className="search-field">
          <span>Target date</span>
          <input
            type="date"
            value={targetDate}
            onChange={(event) => setTargetDate(event.target.value)}
            required
          />
        </label>
        {plan && (
          <label className="filter-field">
            <span>Status</span>
            <select
              value={status}
              onChange={(event) =>
                setStatus(event.target.value as ExitPlanStatus)
              }
            >
              <option value="ACTIVE">Active</option>
              <option value="COMPLETED">Completed</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </label>
        )}
        <label className="search-field stock-plan-rationale">
          <span>Rationale and review details</span>
          <textarea
            rows={5}
            value={rationale}
            onChange={(event) => setRationale(event.target.value)}
            maxLength={5000}
            required
          />
        </label>
        {error && <p className="form-error stock-plan-rationale">{error}</p>}
        <button
          className="primary-button"
          disabled={busy || (!plan && !instrumentId)}
        >
          {busy ? "Saving…" : plan ? "Update plan" : "Create plan"}
        </button>
      </form>
    </section>
  );
}

export function ExitPlansScreen() {
  const [plans, setPlans] = useState<StockExitPlan[]>([]);
  const [instruments, setInstruments] = useState<TradeInstrumentOption[]>([]);
  const [selected, setSelected] = useState<StockExitPlan | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"ALL" | ExitPlanStatus>("ALL");
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [dueCutoff] = useState(() => Date.now() + 30 * 86_400_000);

  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([getExitPlans(controller.signal), getTradeInstruments()])
      .then(([nextPlans, nextInstruments]) => {
        setPlans(nextPlans);
        setInstruments(nextInstruments);
        setError(null);
      })
      .catch((requestError) => {
        if (
          requestError instanceof DOMException &&
          requestError.name === "AbortError"
        )
          return;
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Unable to load exit plans.",
        );
      })
      .finally(() => setBusy(false));
    return () => controller.abort();
  }, [version]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return plans.filter((plan) => {
      if (status !== "ALL" && plan.status !== status) return false;
      return (
        !query ||
        `${plan.instrument.symbol} ${plan.instrument.name ?? ""} ${plan.rationale}`
          .toLowerCase()
          .includes(query)
      );
    });
  }, [plans, search, status]);

  const availableInstruments = instruments.filter(
    (instrument) => !plans.some((plan) => plan.instrumentId === instrument.id),
  );

  function saved() {
    setShowForm(false);
    setSelected(null);
    setBusy(true);
    setVersion((value) => value + 1);
  }

  return (
    <main className="main-content exit-plans-page">
      <header className="page-header">
        <div>
          <span className="section-kicker">Stock-level strategy</span>
          <h1>Exit plans</h1>
          <p>
            Keep one target and review thesis per stock, independent of
            acquisition lots and broker accounts.
          </p>
        </div>
        <button
          className="primary-button"
          onClick={() => {
            setSelected(null);
            setShowForm(true);
          }}
        >
          Add exit plan
        </button>
      </header>

      {showForm && (
        <PlanForm
          key={selected?.id ?? "new"}
          plan={selected}
          instruments={availableInstruments}
          onSaved={saved}
          onCancel={() => {
            setShowForm(false);
            setSelected(null);
          }}
        />
      )}

      <section className="holdings-summary" aria-label="Exit plan summary">
        <article className="summary-tile">
          <span>Total plans</span>
          <strong>{plans.length}</strong>
          <small>One plan per stock</small>
        </article>
        <article className="summary-tile">
          <span>Active</span>
          <strong>
            {plans.filter((plan) => plan.status === "ACTIVE").length}
          </strong>
          <small>Strategies currently monitored</small>
        </article>
        <article className="summary-tile">
          <span>Due within 30 days</span>
          <strong>
            {
              plans.filter(
                (plan) =>
                  plan.status === "ACTIVE" &&
                  new Date(plan.targetDate).getTime() <= dueCutoff,
              ).length
            }
          </strong>
          <small>Includes overdue plans</small>
        </article>
      </section>

      <section className="panel holdings-workspace">
        <div className="panel-heading holdings-toolbar">
          <div>
            <span className="section-kicker">Plan library</span>
            <h2>Stocks and targets</h2>
          </div>
          <div className="holdings-controls">
            <label className="search-field">
              <span>Search</span>
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Symbol or rationale"
              />
            </label>
            <label className="filter-field">
              <span>Status</span>
              <select
                value={status}
                onChange={(event) =>
                  setStatus(event.target.value as typeof status)
                }
              >
                <option value="ALL">All statuses</option>
                <option value="ACTIVE">Active</option>
                <option value="COMPLETED">Completed</option>
                <option value="CANCELLED">Cancelled</option>
              </select>
            </label>
          </div>
        </div>
        {error ? (
          <div className="empty-state">
            <strong>Could not load exit plans</strong>
            <p>{error}</p>
          </div>
        ) : busy ? (
          <div className="transactions-loading">
            <div className="loading-panel" />
          </div>
        ) : !filtered.length ? (
          <div className="empty-state">
            <strong>No exit plans match this view</strong>
            <p>Add a plan or widen the current filters.</p>
          </div>
        ) : (
          <div className="table-scroll holdings-table-wrap">
            <table className="holdings-table exit-plans-table">
              <thead>
                <tr>
                  <th>Stock</th>
                  <th>Target</th>
                  <th>Target date</th>
                  <th>Status</th>
                  <th>Rationale</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((plan) => (
                  <tr key={plan.id}>
                    <td>
                      <strong>{plan.instrument.symbol}</strong>
                      <small className="cell-subtle">
                        {plan.instrument.name ?? plan.instrument.instrumentType}
                      </small>
                    </td>
                    <td>
                      <strong>
                        {formatMoney(
                          plan.targetPrice,
                          plan.instrument.quoteCurrency,
                        )}
                      </strong>
                    </td>
                    <td>{formatDate(plan.targetDate)}</td>
                    <td>
                      <span
                        className={`trade-badge trade-badge--${plan.status.toLowerCase()}`}
                      >
                        {plan.status}
                      </span>
                    </td>
                    <td className="exit-plan-rationale-cell">
                      {plan.rationale}
                    </td>
                    <td>
                      <button
                        className="secondary-button"
                        onClick={() => {
                          setSelected(plan);
                          setShowForm(true);
                          window.scrollTo({ top: 0, behavior: "smooth" });
                        }}
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
