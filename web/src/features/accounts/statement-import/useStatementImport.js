/**
 * useStatementImport.js — The state of «ورود اطلاعات از همراه بانک»: the file read, what the user
 * answered, the plan that follows from both, and the saving
 *
 * One flow, four steps: the file, the questions (the groups of rows the user is asked about),
 * the review (every row, editable, before anything is saved) and the result. The rows are
 * decided by utils/bankStatement.js; this hook only keeps the user's choices and lays them over
 * the suggestions, so going back and forth never loses an answer.
 */

import { useCallback, useMemo, useState } from 'react';
import { readXlsxRows } from '../../../shared/import/xlsxReader.js';
import {
  analyzeStatement, resolvePlan, buildRecords, summarizePlan, readStatement,
} from '../../../utils/bankStatement.js';
import { STATEMENT_SMALL_DEFAULT } from '../../../utils/bankStatementTemplates.js';
import { suggestLinks } from '../../../utils/statementLinks.js';
import { accountHolds } from '../../../utils/accountDocument.js';
import { getCategory } from '../../../shared/categories/categoryStore.js';
import { statementBanksFor } from './statementFormat.js';
import { loadExistingRecords, loadLinkCandidates, saveImport, undoImport } from './statementImportData.js';

const lastDigits = (value, count = 4) => {
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits.length >= count ? digits.slice(-count) : '';
};

/** The category's name as the user sees it (their own names included) */
const labelOf = (kind, value) => getCategory(kind, value)?.label || '';

/**
 * @param {{ account: object, accounts: object[] }} props the account imported into, and all of the user's
 */
export function useStatementImport({ account, accounts }) {
  const banks = statementBanksFor(account);
  const [step, setStep] = useState('file');
  const [bankId, setBankId] = useState(banks[0]?.bankId || '');
  const [fileName, setFileName] = useState('');
  const [statement, setStatement] = useState(null);
  const [existing, setExisting] = useState(null);
  const [candidates, setCandidates] = useState({});
  const [answers, setAnswers] = useState({});
  const [rowOverrides, setRowOverrides] = useState({});
  const [include, setInclude] = useState({});
  const [linkOff, setLinkOff] = useState({});
  const [small, setSmall] = useState({ enabled: true, ...STATEMENT_SMALL_DEFAULT });
  const [reading, setReading] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [result, setResult] = useState(null);
  const [undone, setUndone] = useState(false);

  /** The user's other toman accounts: the other side of a transfer */
  const otherAccounts = useMemo(
    () => accounts.filter((a) => a.id !== account.id && !a.archived && accountHolds(a, 'IRT')),
    [accounts, account.id]
  );

  const analysis = useMemo(
    () => (statement?.ok ? analyzeStatement(statement.transactions, { accounts, accountId: account.id, existing }) : null),
    [statement, accounts, account.id, existing]
  );

  const basePlan = useMemo(
    () => (analysis ? resolvePlan(analysis, { answers, rowOverrides, small, include, accountId: account.id, labelOf }) : []),
    [analysis, answers, rowOverrides, small, include, account.id]
  );

  const plan = useMemo(() => {
    const suggested = suggestLinks(basePlan, candidates);
    return basePlan.map((row) => (suggested[row.tx.id] && !linkOff[row.tx.id] ? { ...row, link: suggested[row.tx.id], linkable: true } : { ...row, linkable: Boolean(suggested[row.tx.id]), link: null }));
  }, [basePlan, candidates, linkOff]);

  const summary = useMemo(() => summarizePlan(plan), [plan]);

  /** The file belongs to another account than the one it is imported into (both numbers known and different) */
  const accountMismatch = useMemo(() => {
    if (!analysis) return false;
    const cards = analysis.own.cards.map((c) => lastDigits(c));
    const numbers = analysis.own.accounts.map((n) => lastDigits(n));
    const card = lastDigits(account.cardLast4 || '', 4);
    const number = lastDigits(account.accountNumber || '', 4);
    if (card && cards.length && !cards.includes(card)) return true;
    if (number && numbers.length && !numbers.includes(number)) return true;
    return false;
  }, [analysis, account]);

  const loadFile = useCallback(async (file) => {
    setError('');
    setReading(true);
    try {
      const rows = await readXlsxRows(await file.arrayBuffer());
      const read = readStatement(rows, bankId);
      if (!read.ok) throw new Error(read.error);
      const [records, links] = await Promise.all([loadExistingRecords(read.period), loadLinkCandidates()]);
      setExisting(records);
      setCandidates(links);
      setStatement(read);
      setFileName(file.name);
      setAnswers({});
      setRowOverrides({});
      setInclude({});
      setLinkOff({});
    } catch (err) {
      setStatement(null);
      setError(err?.message || 'خواندن فایل ممکن نشد.');
    } finally {
      setReading(false);
    }
  }, [bankId]);

  const answerGroup = useCallback((key, decision) => setAnswers((a) => ({ ...a, [key]: decision })), []);
  const clearGroup = useCallback((key) => setAnswers((a) => { const { [key]: _drop, ...rest } = a; return rest; }), []);
  const overrideRow = useCallback((id, decision) => setRowOverrides((o) => ({ ...o, [id]: decision })), []);
  const clearRow = useCallback((id) => setRowOverrides((o) => { const { [id]: _drop, ...rest } = o; return rest; }), []);
  const setIncluded = useCallback((id, value) => setInclude((i) => ({ ...i, [id]: value })), []);
  const setIncludedMany = useCallback((ids, value) => setInclude((i) => ({ ...i, ...Object.fromEntries(ids.map((id) => [id, value])) })), []);
  const setLink = useCallback((id, on) => setLinkOff((l) => ({ ...l, [id]: !on })), []);

  const save = useCallback(async () => {
    setError('');
    setStep('saving');
    const records = buildRecords(plan, { accountId: account.id, bankId });
    const { saved, error: failure } = await saveImport(records, { onProgress: (done, total) => setProgress({ done, total }) });
    setResult({ saved, failure, planned: records.expenses.length + records.incomes.length + records.transfers.length });
    setStep('done');
  }, [plan, account.id, bankId]);

  const undo = useCallback(async () => {
    if (!result) return;
    try {
      await undoImport(result.saved);
      setUndone(true);
    } catch (err) {
      setError(err?.message || 'بازگردانی ممکن نشد.');
    }
  }, [result]);

  return {
    banks, bankId, setBankId, step, setStep, fileName, statement, analysis, plan, summary, answers, rowOverrides, include,
    small, setSmall, otherAccounts, reading, error, setError, progress, result, undone, accountMismatch,
    loadFile, answerGroup, clearGroup, overrideRow, clearRow, setIncluded, setIncludedMany, setLink, save, undo,
  };
}
