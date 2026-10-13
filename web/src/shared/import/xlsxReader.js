/**
 * xlsxReader.js — Reads the first sheet of an Excel file (.xlsx) into rows of text
 *
 * An .xlsx file is a zip of XML parts. This reads just what a bank statement needs — the first
 * sheet's cells, with shared and inline strings — with the browser's own decompression
 * (`DecompressionStream`) and no library, so nothing about the file leaves the device and the
 * app's size does not grow. Dates are expected as text (as banks export them), numbers come back
 * as their plain text.
 */

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
/** The most a file can hold: a statement is a year of rows, not a database */
export const XLSX_MAX_BYTES = 20 * 1024 * 1024;

const decoder = new TextDecoder('utf-8');

/** Inflate raw deflate bytes (the zip's method 8) */
async function inflate(bytes) {
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  }).pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** The zip's entries: name → where its data is */
function readCentralDirectory(buffer) {
  const view = new DataView(buffer);
  let eocd = -1;
  for (let i = buffer.byteLength - 22; i >= Math.max(0, buffer.byteLength - 22 - 65535); i--) {
    if (view.getUint32(i, true) === EOCD_SIGNATURE) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('فایل اکسل معتبر نیست.');
  const count = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);
  const entries = new Map();
  for (let n = 0; n < count; n++) {
    if (view.getUint32(offset, true) !== CENTRAL_SIGNATURE) throw new Error('فایل اکسل معتبر نیست.');
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const name = decoder.decode(new Uint8Array(buffer, offset + 46, nameLength));
    entries.set(name, { method, compressedSize, localOffset });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

/** One entry's text, or '' when the file has none by that name */
async function readEntry(buffer, entries, name) {
  const entry = entries.get(name);
  if (!entry) return '';
  const view = new DataView(buffer);
  if (view.getUint32(entry.localOffset, true) !== LOCAL_SIGNATURE) throw new Error('فایل اکسل معتبر نیست.');
  const start = entry.localOffset + 30 + view.getUint16(entry.localOffset + 26, true) + view.getUint16(entry.localOffset + 28, true);
  const data = new Uint8Array(buffer, start, entry.compressedSize);
  if (entry.method === 0) return decoder.decode(data);
  if (entry.method === 8) return decoder.decode(await inflate(data));
  throw new Error('این نوع فشرده‌سازی در فایل اکسل پشتیبانی نمی‌شود.');
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const decodeXml = (text) => text.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (match, code) => {
  if (code[0] === '#') {
    const point = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
    return Number.isFinite(point) ? String.fromCodePoint(point) : match;
  }
  return ENTITIES[code] ?? match;
});

/** The text inside every <t> of an XML fragment (a shared string may be several rich-text runs) */
const textOf = (xml) => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => decodeXml(m[1])).join('');

function readSharedStrings(xml) {
  return [...xml.matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1]));
}

/** «AB12» → column index 27 */
function columnOf(ref) {
  let column = 0;
  for (const ch of ref.replace(/[^A-Za-z]/g, '').toUpperCase()) column = column * 26 + (ch.charCodeAt(0) - 64);
  return column - 1;
}

/** The first sheet's path inside the zip, through the workbook and its relationships */
function firstSheetPath(workbookXml, relsXml) {
  const sheet = /<sheet\s[^>]*r:id="([^"]+)"/.exec(workbookXml);
  if (sheet) {
    const rel = [...relsXml.matchAll(/<Relationship\s[^>]*>/g)]
      .map((m) => m[0])
      .find((tag) => new RegExp(`Id="${sheet[1]}"`).test(tag));
    const target = rel && /Target="([^"]+)"/.exec(rel)?.[1];
    if (target) return target.startsWith('/') ? target.slice(1) : `xl/${target}`;
  }
  return 'xl/worksheets/sheet1.xml';
}

function readSheet(xml, shared) {
  const rows = [];
  for (const rowMatch of xml.matchAll(/<row(?:\s[^>]*)?>([\s\S]*?)<\/row>/g)) {
    const rowTag = /^<row\s[^>]*?r="(\d+)"/.exec(rowMatch[0]);
    const rowIndex = rowTag ? Number(rowTag[1]) - 1 : rows.length;
    const cells = [];
    for (const cellMatch of rowMatch[1].matchAll(/<c\s([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cellMatch[1];
      const ref = /\br="([A-Za-z]+\d+)"/.exec(attrs)?.[1];
      const type = /\bt="(\w+)"/.exec(attrs)?.[1] || 'n';
      const body = cellMatch[2] || '';
      const column = ref ? columnOf(ref) : cells.length;
      let value = '';
      if (type === 'inlineStr') value = textOf(body);
      else {
        const raw = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
        if (raw !== undefined) value = type === 's' ? (shared[Number(raw)] ?? '') : decodeXml(raw);
      }
      cells[column] = value;
    }
    // Sparse rows (empty cells skipped by the file) get empty strings
    rows[rowIndex] = Array.from(cells, (v) => v ?? '');
  }
  return Array.from(rows, (r) => r || []);
}

/**
 * The rows of the first sheet
 * @param {ArrayBuffer} buffer the file's bytes
 * @returns {Promise<string[][]>}
 */
export async function readXlsxRows(buffer) {
  if (!buffer || buffer.byteLength < 22) throw new Error('فایل اکسل معتبر نیست.');
  if (buffer.byteLength > XLSX_MAX_BYTES) throw new Error('فایل بیش از حد بزرگ است.');
  // .xlsx and .xlsm are zips; the old .xls is not
  if (new DataView(buffer).getUint32(0, true) !== LOCAL_SIGNATURE) throw new Error('فقط فایل اکسل با پسوند xlsx پشتیبانی می‌شود.');
  const entries = readCentralDirectory(buffer);
  const [workbook, rels, sharedXml] = await Promise.all([
    readEntry(buffer, entries, 'xl/workbook.xml'),
    readEntry(buffer, entries, 'xl/_rels/workbook.xml.rels'),
    readEntry(buffer, entries, 'xl/sharedStrings.xml'),
  ]);
  const sheetXml = await readEntry(buffer, entries, firstSheetPath(workbook, rels));
  if (!sheetXml) throw new Error('صفحه‌ای در فایل اکسل پیدا نشد.');
  return readSheet(sheetXml, readSharedStrings(sharedXml));
}
