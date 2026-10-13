/**
 * StatementImportModal.jsx — «ورود اطلاعات از همراه بانک»: a bank's exported statement becomes the
 * account's expenses, incomes and transfers
 *
 * Four steps, nothing stored until the third: the file (read on the device, never uploaded), the
 * questions about groups of rows (ten deposits from one account: salary?), the review of every
 * row, and the result with an undo. What was imported is marked «ورود خودکار» in the expenses and
 * incomes. See docs/BANK_STATEMENT_IMPORT.md.
 */

import React, { useRef } from 'react';
import { FileSpreadsheet, Upload, Undo2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { AlertBanner, Button, Modal } from '../../../shared/ui/index.js';
import { useCategories } from '../../../shared/categories/useCategories.js';
import { accountLabel } from '../constants/accountDisplay.js';
import StatementQuestionsStep from './StatementQuestionsStep.jsx';
import StatementReviewStep from './StatementReviewStep.jsx';
import { useStatementImport } from './useStatementImport.js';
import { faAmount, shamsiDay } from './statementFormat.js';

const STEPS = [
  { value: 'file', label: '۱. فایل' },
  { value: 'questions', label: '۲. پرسش‌ها' },
  { value: 'review', label: '۳. بازبینی' },
];

function FileStep({ flow, account }) {
  const input = useRef(null);
  const { statement, analysis, banks, bankId, setBankId, reading, fileName, accountMismatch } = flow;
  const bank = banks.find((b) => b.bankId === bankId) || banks[0];
  return (
    <div className="statement-step">
      <section className="statement-intro">
        <p>گردش حساب «{accountLabel(account)}» را از همراه بانک به‌صورت فایل اکسل بگیرید و اینجا بدهید. فایل فقط روی دستگاه شما خوانده می‌شود، چیزی از آن به جایی فرستاده نمی‌شود و هیچ چیز پیش از تأیید نهایی شما ثبت نمی‌شود.</p>
        {banks.length > 1 && (
          <label className="statement-field" htmlFor="statement-bank">
            <span>بانک</span>
            <select id="statement-bank" className="statement-select" value={bankId} onChange={(e) => setBankId(e.target.value)}>
              {banks.map((b) => <option key={b.bankId} value={b.bankId}>{b.label}</option>)}
            </select>
          </label>
        )}
        {bank && <p className="statement-muted">{bank.howTo}</p>}
        <input
          ref={input}
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) flow.loadFile(file);
          }}
        />
        <Button icon={<Upload size={16} />} variant={statement ? 'secondary' : 'primary'} loading={reading} onClick={() => input.current?.click()}>
          {statement ? 'انتخاب فایل دیگر' : 'انتخاب فایل اکسل'}
        </Button>
      </section>

      {statement?.ok && analysis && (
        <section className="statement-found">
          <h4><CheckCircle2 size={16} /> {fileName}</h4>
          <div className="statement-tiles">
            <div className="statement-tile"><span>تراکنش</span><strong>{faAmount(statement.transactions.length)}</strong></div>
            <div className="statement-tile"><span>از</span><strong>{shamsiDay(statement.period.from)}</strong></div>
            <div className="statement-tile"><span>تا</span><strong>{shamsiDay(statement.period.to)}</strong></div>
            <div className="statement-tile"><span>گروه</span><strong>{faAmount(analysis.groups.length)}</strong></div>
          </div>
          {accountMismatch && (
            <p className="statement-row-note is-error"><AlertTriangle size={12} /> شماره کارت یا حساب داخل فایل با این حساب نمی‌خواند؛ مطمئن شوید فایل مال همین حساب است.</p>
          )}
          {statement.skipped.length > 0 && (
            <p className="statement-row-note"><AlertTriangle size={12} /> {faAmount(statement.skipped.length)} ردیف خوانده نشد (ردیف‌های {statement.skipped.slice(0, 5).map((s) => faAmount(s.row)).join('، ')}{statement.skipped.length > 5 ? ' و ...' : ''}) و کنار گذاشته شد.</p>
          )}
          {statement.balanceMismatches > 0 && (
            <p className="statement-row-note"><AlertTriangle size={12} /> مانده‌ی {faAmount(statement.balanceMismatches)} ردیف با ردیف قبلش نمی‌خواند؛ شاید ردیفی از فایل جا افتاده یا ویرایش شده. مبلغ‌ها را در بازبینی ببینید.</p>
          )}
        </section>
      )}
    </div>
  );
}

function DoneStep({ flow }) {
  const { result, undone } = flow;
  const saved = result.saved;
  const count = saved.expenses.length + saved.incomes.length + saved.transfers.length;
  return (
    <div className="statement-step">
      {undone ? (
        <AlertBanner type="info" message="همه‌ی موردهای این ورود برگردانده شد." />
      ) : (
        <AlertBanner
          type={result.failure ? 'warning' : 'success'}
          message={result.failure
            ? `${faAmount(count)} مورد از ${faAmount(result.planned)} ثبت شد. بقیه ثبت نشد: ${result.failure}`
            : `${faAmount(count)} مورد ثبت شد: ${faAmount(saved.expenses.length)} هزینه، ${faAmount(saved.incomes.length)} درآمد و ${faAmount(saved.transfers.length)} انتقال.`}
        />
      )}
      {result.failure && !undone && <p className="statement-muted">همان فایل را دوباره بدهید؛ مواردی که ثبت شده‌اند دوباره ثبت نمی‌شوند و فقط بقیه می‌ماند.</p>}
      {!undone && count > 0 && (
        <>
          <p className="statement-muted">این موردها در هزینه‌ها و درآمدها با نشان «ورود خودکار» دیده می‌شوند و مثل بقیه قابل ویرایش‌اند.</p>
          <Button variant="secondary" icon={<Undo2 size={16} />} onClick={flow.undo}>بازگرداندن همه‌ی این ورود</Button>
        </>
      )}
    </div>
  );
}

/**
 * @param {{ account: object, accounts: object[], onClose: () => void, onImported?: () => void }} props
 */
export default function StatementImportModal({ account, accounts, onClose, onImported }) {
  const flow = useStatementImport({ account, accounts });
  const categories = { expense: useCategories('expense'), income: useCategories('income') };
  const { step, statement, summary, plan } = flow;
  const total = summary.expense.count + summary.income.count + summary.transfer.count;
  const close = () => {
    if (step === 'done') onImported?.();
    onClose();
  };

  let footer;
  if (step === 'file') {
    footer = (
      <div className="modal-actions">
        <Button variant="secondary" block onClick={close}>انصراف</Button>
        <Button block disabled={!statement?.ok || flow.reading} onClick={() => flow.setStep('questions')}>ادامه</Button>
      </div>
    );
  } else if (step === 'questions') {
    footer = (
      <div className="modal-actions">
        <Button variant="secondary" block onClick={() => flow.setStep('file')}>قبلی</Button>
        <Button block onClick={() => flow.setStep('review')}>بازبینی همه‌ی ردیف‌ها</Button>
      </div>
    );
  } else if (step === 'review') {
    footer = (
      <div className="modal-actions">
        <Button variant="secondary" block onClick={() => flow.setStep('questions')}>قبلی</Button>
        <Button block disabled={total === 0} onClick={flow.save}>ثبت {faAmount(total)} مورد</Button>
      </div>
    );
  } else {
    footer = <div className="modal-actions"><Button block onClick={close}>بستن</Button></div>;
  }

  return (
    <Modal
      isOpen
      onClose={step === 'saving' ? () => {} : close}
      title="ورود اطلاعات از همراه بانک"
      subtitle={`به حساب «${accountLabel(account)}»`}
      icon={<FileSpreadsheet size={18} />}
      maxWidth="860px"
      className="statement-modal"
      footer={footer}
    >
      <div className="statement-body">
        {(step === 'file' || step === 'questions' || step === 'review') && (
          <ol className="statement-steps" aria-label="مرحله‌ها">
            {STEPS.map((s) => <li key={s.value} className={s.value === step ? 'is-active' : ''}>{s.label}</li>)}
          </ol>
        )}
        {flow.error && <AlertBanner type="error" message={flow.error} onClose={() => flow.setError('')} />}
        {step === 'file' && <FileStep flow={flow} account={account} />}
        {step === 'questions' && (
          <StatementQuestionsStep
            analysis={flow.analysis}
            answers={flow.answers}
            small={flow.small}
            onSmall={flow.setSmall}
            onAnswer={flow.answerGroup}
            onClear={flow.clearGroup}
            accounts={flow.otherAccounts}
            categories={categories}
          />
        )}
        {step === 'review' && (
          <StatementReviewStep
            plan={plan}
            summary={summary}
            accounts={flow.otherAccounts}
            categories={categories}
            onOverride={flow.overrideRow}
            onClearOverride={flow.clearRow}
            onInclude={flow.setIncluded}
            onIncludeMany={flow.setIncludedMany}
            onLink={flow.setLink}
          />
        )}
        {step === 'saving' && (
          <div className="statement-step" role="status">
            <p>در حال ثبت… {faAmount(flow.progress.done)} از {faAmount(flow.progress.total)}</p>
            <progress max={flow.progress.total || 1} value={flow.progress.done} className="statement-progress" />
            <p className="statement-muted">این صفحه را نبندید.</p>
          </div>
        )}
        {step === 'done' && <DoneStep flow={flow} />}
      </div>
    </Modal>
  );
}
