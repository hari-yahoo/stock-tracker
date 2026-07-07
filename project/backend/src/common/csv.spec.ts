import { parseCsv, writeCsv } from './csv';

describe('CSV codec', () => {
  it('round-trips commas, quotes, and newlines', () => {
    const rows = [
      ['symbol', 'notes'],
      ['INFY', 'Thesis, with comma'],
      ['AAPL', 'A "quoted"\nline'],
    ];
    expect(parseCsv(writeCsv(rows))).toEqual(rows);
  });

  it('rejects an unterminated quoted field', () => {
    expect(() => parseCsv('symbol,notes\nINFY,"broken')).toThrow(
      'unterminated',
    );
  });
});
