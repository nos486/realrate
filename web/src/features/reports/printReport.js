/**
 * printReport.js — «خروجی PDF»: the reports page printed on its own (the browser's «Save as PDF»)
 *
 * The figures are end-to-end encrypted and worked out in the browser, so the PDF is made there
 * too: the page's own layout (styles/reports.css @media print), every font and chart as shown,
 * nothing sent anywhere. Before printing, the elements from <body> down to the report are marked
 * (`print-path`) so the print styles can drop everything else — the header, the navigation, the
 * banners — whatever the page's frame is. The file is named after the document's title.
 */

const PATH = 'print-path';
const ACTIVE = 'printing-report';

/**
 * @param {HTMLElement} report the report's root element
 * @param {string} fileTitle the PDF's suggested name
 */
export function printReport(report, fileTitle) {
  if (!report || typeof window.print !== 'function') return;
  const marked = [];
  for (let el = report.parentElement; el && el !== document.body; el = el.parentElement) {
    el.classList.add(PATH);
    marked.push(el);
  }
  const root = document.documentElement;
  const title = document.title;
  const cleanUp = () => {
    marked.forEach((el) => el.classList.remove(PATH));
    root.classList.remove(ACTIVE);
    document.title = title;
    window.removeEventListener('afterprint', cleanUp);
  };
  root.classList.add(ACTIVE);
  document.title = fileTitle;
  window.addEventListener('afterprint', cleanUp);
  window.print();
}
