import { BadGatewayException, Injectable } from '@nestjs/common';
import { PriceInstrumentRef, PriceProviderResult } from './nse-price-provider';

function decimalString(value: number) {
  return value.toFixed(6).replace(/\.?0+$/, '');
}

@Injectable()
export class ZerodhaPriceProvider {
  readonly name = 'ZERODHA';

  isConfigured() {
    return Boolean(
      process.env.ZERODHA_API_KEY && process.env.ZERODHA_ACCESS_TOKEN,
    );
  }

  async fetchQuotes(
    instruments: PriceInstrumentRef[],
  ): Promise<PriceProviderResult> {
    if (!this.isConfigured()) {
      throw new BadGatewayException(
        'Zerodha price provider is not configured. Set ZERODHA_API_KEY and ZERODHA_ACCESS_TOKEN.',
      );
    }

    const quotes: PriceProviderResult['quotes'] = [];
    const missingSymbols: string[] = [];

    for (let index = 0; index < instruments.length; index += 250) {
      const batch = instruments.slice(index, index + 250);
      const search = new URLSearchParams();
      batch.forEach((instrument) =>
        search.append('i', `NSE:${instrument.symbol}`),
      );

      const response = await fetch(
        `https://api.kite.trade/quote/ltp?${search.toString()}`,
        {
          headers: {
            'X-Kite-Version': '3',
            Authorization: `token ${process.env.ZERODHA_API_KEY}:${process.env.ZERODHA_ACCESS_TOKEN}`,
          },
        },
      );

      if (!response.ok) {
        const body = await response.text();
        throw new BadGatewayException(
          `Zerodha quote request failed (${response.status}): ${body.slice(0, 200)}`,
        );
      }

      const payload = (await response.json()) as {
        data?: Record<string, { last_price?: number }>;
      };
      const data = payload.data ?? {};

      for (const instrument of batch) {
        const key = `NSE:${instrument.symbol}`;
        const lastPrice = data[key]?.last_price;
        if (typeof lastPrice === 'number' && Number.isFinite(lastPrice)) {
          quotes.push({
            instrumentId: instrument.id,
            price: decimalString(lastPrice),
          });
        } else {
          missingSymbols.push(key);
        }
      }
    }

    return {
      provider: this.name,
      quotes,
      missingSymbols,
    };
  }
}
