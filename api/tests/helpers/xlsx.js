/**
 * xlsx.js — Builds a minimal .xlsx file (a zip of XML parts) from rows of text, for the tests of
 * the statement import. Strings go through the shared-strings part, the parts are deflated like
 * Excel's, and every cell gets its reference, so the reader meets what a real file looks like.
 */

import { deflateRawSync } from 'node:zlib';

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (bytes) => {
  let c = 0xffffffff;
  for (const b of bytes) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

const escapeXml = (text) => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const columnName = (index) => {
  let name = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  return name;
};

/** @param {Array<Array<string|number|null>>} rows @returns {Buffer} the .xlsx bytes */
export function buildXlsx(rows, { deflate = true } = {}) {
  const shared = [];
  const indexOf = new Map();
  const sheetRows = rows.map((row, r) => {
    const cells = row.map((value, c) => {
      if (value === null || value === undefined || value === '') return '';
      const ref = `${columnName(c)}${r + 1}`;
      if (typeof value === 'number') return `<c r="${ref}"><v>${value}</v></c>`;
      if (!indexOf.has(value)) { indexOf.set(value, shared.length); shared.push(value); }
      return `<c r="${ref}" t="s"><v>${indexOf.get(value)}</v></c>`;
    }).join('');
    return `<row r="${r + 1}">${cells}</row>`;
  }).join('');
  const parts = {
    '[Content_Types].xml': '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>',
    'xl/workbook.xml': '<?xml version="1.0"?><workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels': '<?xml version="1.0"?><Relationships><Relationship Id="rId1" Type="worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
    'xl/sharedStrings.xml': `<?xml version="1.0"?><sst count="${shared.length}" uniqueCount="${shared.length}">${shared.map((s) => `<si><t xml:space="preserve">${escapeXml(s)}</t></si>`).join('')}</sst>`,
    'xl/worksheets/sheet1.xml': `<?xml version="1.0"?><worksheet><sheetData>${sheetRows}</sheetData></worksheet>`,
  };

  const chunks = [];
  const central = [];
  let offset = 0;
  for (const [name, text] of Object.entries(parts)) {
    const raw = Buffer.from(text, 'utf8');
    const data = deflate ? deflateRawSync(raw) : raw;
    const nameBytes = Buffer.from(name, 'utf8');
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(deflate ? 8 : 0, 8);
    header.writeUInt32LE(crc32(raw), 14);
    header.writeUInt32LE(data.length, 18);
    header.writeUInt32LE(raw.length, 22);
    header.writeUInt16LE(nameBytes.length, 26);
    chunks.push(header, nameBytes, data);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(deflate ? 8 : 0, 10);
    entry.writeUInt32LE(crc32(raw), 16);
    entry.writeUInt32LE(data.length, 20);
    entry.writeUInt32LE(raw.length, 24);
    entry.writeUInt16LE(nameBytes.length, 28);
    entry.writeUInt32LE(offset, 42);
    central.push(entry, nameBytes);
    offset += header.length + nameBytes.length + data.length;
  }
  const centralBytes = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(parts).length, 8);
  end.writeUInt16LE(Object.keys(parts).length, 10);
  end.writeUInt32LE(centralBytes.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...chunks, centralBytes, end]);
}
