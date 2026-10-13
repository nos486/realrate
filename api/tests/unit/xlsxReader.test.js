import { describe, it, expect } from 'vitest';
import { readXlsxRows, XLSX_MAX_BYTES } from '../../../web/src/shared/import/xlsxReader.js';
import { buildXlsx } from '../helpers/xlsx.js';
import { parsianSheet } from '../helpers/parsianRows.js';
import { readStatement } from '../../src/domain/bankStatement.js';

const toBuffer = (bytes) => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);

describe('readXlsxRows', () => {
  it('reads the cells of the first sheet, deflated or stored', async () => {
    const rows = [['ردیف', 'تاریخ', null, 'x & <y>'], ['1', '1405/06/31 - 17:38:24', null, 'ب'], [], ['3', '', '', 'پایان']];
    for (const deflate of [true, false]) {
      const read = await readXlsxRows(toBuffer(buildXlsx(rows, { deflate })));
      expect(read[0]).toEqual(['ردیف', 'تاریخ', '', 'x & <y>']);
      expect(read[1][1]).toBe('1405/06/31 - 17:38:24');
      expect(read[2]).toEqual([]);
      expect(read[3][3]).toBe('پایان');
    }
  });

  it('reads numbers as text and honours the column of a cell after a gap', async () => {
    const read = await readXlsxRows(toBuffer(buildXlsx([[null, null, 42]])));
    expect(read[0]).toEqual(['', '', '42']);
  });

  it('feeds the statement reader the same table the sheet held', async () => {
    const sheet = parsianSheet();
    const rows = await readXlsxRows(toBuffer(buildXlsx(sheet)));
    expect(rows).toHaveLength(sheet.length);
    const statement = readStatement(rows, 'parsian');
    expect(statement.ok).toBe(true);
    expect(statement.transactions).toHaveLength(sheet.length - 1);
    expect(statement.balanceMismatches).toBe(0);
  });

  it('refuses what is not an .xlsx', async () => {
    await expect(readXlsxRows(new ArrayBuffer(4))).rejects.toThrow();
    await expect(readXlsxRows(toBuffer(Buffer.from('a,b\n1,2\n'.repeat(10))))).rejects.toThrow(/xlsx/);
    // The old binary .xls
    await expect(readXlsxRows(toBuffer(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, ...Array(40).fill(0)])))).rejects.toThrow(/xlsx/);
    expect(XLSX_MAX_BYTES).toBeGreaterThan(1024 * 1024);
  });

  it('refuses a file with no sheet', async () => {
    const bytes = buildXlsx([['a']]);
    // A zip whose sheet part is renamed away
    const broken = Buffer.from(bytes.toString('latin1').replaceAll('xl/worksheets/sheet1.xml', 'xl/worksheets/sheetX.xml'), 'latin1');
    await expect(readXlsxRows(toBuffer(broken))).rejects.toThrow();
  });
});
