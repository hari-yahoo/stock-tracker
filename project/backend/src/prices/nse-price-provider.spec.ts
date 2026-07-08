import { NsePriceProvider } from './nse-price-provider';

describe('NsePriceProvider', () => {
  it('returns NSE LTPs and reports unsupported or failed symbols', async () => {
    const provider = new NsePriceProvider();
    const getEquityDetails = jest
      .fn()
      .mockResolvedValueOnce({ priceInfo: { lastPrice: 1711.45 } })
      .mockRejectedValueOnce(new Error('Unknown symbol'));

    (
      provider as unknown as {
        client: { getEquityDetails: typeof getEquityDetails };
      }
    ).client = { getEquityDetails };

    const result = await provider.fetchQuotes([
      { id: 'infy-id', symbol: 'infy', exchange: 'nse' },
      { id: 'bad-id', symbol: 'bad', exchange: 'NSE' },
      { id: 'aapl-id', symbol: 'AAPL', exchange: 'NASDAQ' },
    ]);

    expect(result).toEqual({
      provider: 'NSE',
      quotes: [{ instrumentId: 'infy-id', price: '1711.45' }],
      missingSymbols: ['NSE:BAD', 'NASDAQ:AAPL'],
    });
    expect(getEquityDetails).toHaveBeenCalledTimes(2);
    expect(getEquityDetails).toHaveBeenNthCalledWith(1, 'INFY');
    expect(getEquityDetails).toHaveBeenNthCalledWith(2, 'BAD');
  });
});
