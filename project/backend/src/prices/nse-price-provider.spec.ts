import { NsePriceProvider } from './nse-price-provider';

describe('NsePriceProvider', () => {
  it('always retrieves NSE LTPs regardless of stored exchange', async () => {
    const provider = new NsePriceProvider();
    const getEquityDetails = jest
      .fn()
      .mockResolvedValueOnce({ priceInfo: { lastPrice: 1711.45 } })
      .mockRejectedValueOnce(new Error('Unknown symbol'))
      .mockRejectedValueOnce(new Error('Unknown symbol'));
    const getDataByEndpoint = jest.fn().mockResolvedValue({
      data: [
        { symbol: 'PSUBNKBEES', ltP: '81.40' },
        { symbol: 'IGNORED', ltP: '-' },
      ],
    });

    (
      provider as unknown as {
        client: {
          getEquityDetails: typeof getEquityDetails;
          getDataByEndpoint: typeof getDataByEndpoint;
        };
      }
    ).client = { getEquityDetails, getDataByEndpoint };

    const result = await provider.fetchQuotes([
      {
        id: 'infy-id',
        symbol: 'infy',
        exchange: 'nse',
        instrumentType: 'EQUITY',
      },
      {
        id: 'etf-id',
        symbol: 'PSUBNKBEES',
        exchange: 'NSE',
        instrumentType: 'ETF',
      },
      {
        id: 'bad-id',
        symbol: 'BAD',
        exchange: 'NASDAQ',
        instrumentType: 'EQUITY',
      },
    ]);

    expect(result).toEqual({
      provider: 'NSE',
      quotes: [
        { instrumentId: 'infy-id', price: '1711.45' },
        { instrumentId: 'etf-id', price: '81.4' },
      ],
      missingSymbols: ['NSE:BAD'],
    });
    expect(getEquityDetails).toHaveBeenCalledTimes(2);
    expect(getEquityDetails).toHaveBeenNthCalledWith(1, 'INFY');
    expect(getEquityDetails).toHaveBeenNthCalledWith(2, 'BAD');
    expect(getDataByEndpoint).toHaveBeenCalledTimes(1);
    expect(getDataByEndpoint).toHaveBeenCalledWith('/api/etf');
  });
});
