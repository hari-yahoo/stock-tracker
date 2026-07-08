import { Injectable } from '@nestjs/common';
import { NseIndia } from 'stock-nse-india';

export interface PriceInstrumentRef {
  id: string;
  symbol: string;
  exchange: string;
}

export interface PriceProviderResult {
  provider: string;
  quotes: Array<{ instrumentId: string; price: string }>;
  missingSymbols: string[];
}

function decimalString(value: number) {
  return value.toFixed(6).replace(/\.?0+$/, '');
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
    const missingSymbols: string[] = [];

    for (const instrument of instruments) {
      const symbol = instrument.symbol.trim().toUpperCase();
      console.log(
        `Fetching NSE quote for NSE:${symbol} (id: ${instrument.id})`,
      );

      try {
        const details = await this.client.getEquityDetails(symbol);
        const lastPrice = details.priceInfo?.lastPrice;
        if (typeof lastPrice === 'number' && Number.isFinite(lastPrice)) {
          console.log(`NSE:${symbol} (id: ${instrument.id}): ${lastPrice}`);
          quotes.push({
            instrumentId: instrument.id,
            price: decimalString(lastPrice),
          });
        } else {
          missingSymbols.push(`NSE:${symbol}`);
        }
      } catch {
        missingSymbols.push(`NSE:${symbol}`);
      }

      await new Promise((resolve) => setTimeout(resolve, 300));
    }

    return { provider: this.name, quotes, missingSymbols };
  }
}
