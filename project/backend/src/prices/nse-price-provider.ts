import { Injectable } from '@nestjs/common';
import { NseIndia } from 'stock-nse-india';

export interface PriceInstrumentRef {
  id: string;
  symbol: string;
  exchange: string;
  instrumentType: 'EQUITY' | 'ETF';
}

export interface PriceProviderResult {
  provider: string;
  quotes: Array<{ instrumentId: string; price: string }>;
  missingSymbols: string[];
}

function decimalString(value: number) {
  return value.toFixed(6).replace(/\.?0+$/, '');
}

function numericPrice(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const parsed = Number(value.replace(/,/g, '').trim());
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

@Injectable()
export class NsePriceProvider {
  readonly name = 'NSE';
  private readonly client = new NseIndia();

  isConfigured() {
    return true;
  }

  async fetchQuotes(
    instruments: PriceInstrumentRef[],
  ): Promise<PriceProviderResult> {
    const quotes: PriceProviderResult['quotes'] = [];
    const equityInstruments = instruments.filter(
      (instrument) => instrument.instrumentType === 'EQUITY',
    );
    const etfInstruments = instruments.filter(
      (instrument) => instrument.instrumentType === 'ETF',
    );
    const missedInstruments: PriceInstrumentRef[] = [];

    for (const instrument of equityInstruments) {
      const symbol = instrument.symbol.trim().toUpperCase();
      console.log(`Fetching quote for NSE:${symbol}`);

      try {
        const details = await this.client.getEquityDetails(symbol);
        const lastPrice = details.priceInfo?.lastPrice;
        if (typeof lastPrice === 'number' && Number.isFinite(lastPrice)) {
          console.log(`${symbol} ---> ${lastPrice}`);
          quotes.push({
            instrumentId: instrument.id,
            price: decimalString(lastPrice),
          });
        } else {
          missedInstruments.push(instrument);
        }
      } catch {
        missedInstruments.push(instrument);
      }

      await new Promise((resolve) => setTimeout(resolve, 300));
    }

    const missingSymbols: string[] = [];
    const etfCandidates = [...etfInstruments, ...missedInstruments];
    if (etfCandidates.length) {
      let etfPrices = new Map<string, number>();
      try {
        const payload = (await this.client.getDataByEndpoint('/api/etf')) as {
          data?: Array<{ symbol?: unknown; ltP?: unknown }>;
        };
        etfPrices = new Map(
          (payload.data ?? []).flatMap((row) => {
            const symbol =
              typeof row.symbol === 'string'
                ? row.symbol.trim().toUpperCase()
                : '';
            const price = numericPrice(row.ltP);
            return symbol && price !== null ? [[symbol, price]] : [];
          }),
        );
      } catch {
        // The equity results are still useful when NSE's ETF list is unavailable.
      }

      for (const instrument of etfCandidates) {
        const symbol = instrument.symbol.trim().toUpperCase();
        const price = etfPrices.get(symbol);
        if (price === undefined) {
          missingSymbols.push(`NSE:${symbol}`);
        } else {
          quotes.push({
            instrumentId: instrument.id,
            price: decimalString(price),
          });
        }
      }
    }

    return { provider: this.name, quotes, missingSymbols };
  }
}
