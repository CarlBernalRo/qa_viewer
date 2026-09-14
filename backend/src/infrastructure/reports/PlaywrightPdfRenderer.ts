import { chromium } from 'playwright';
import type { ReportRenderer, SessionReportData } from '../../domain/ports.js';
import { buildReportHtml, escapeHtml } from './reportHtml.js';

/** Imprime el informe a PDF con el mismo Chromium que usa el grabador. */
export class PlaywrightPdfRenderer implements ReportRenderer {
  async renderPdf(report: SessionReportData): Promise<Uint8Array> {
    const browser = await chromium.launch({ headless: true });
    try {
      // Sin JavaScript: el informe es HTML estático y parte de sus textos viene de páginas de terceros.
      const context = await browser.newContext({ javaScriptEnabled: false });
      const page = await context.newPage();
      await page.setContent(buildReportHtml(report), { waitUntil: 'load' });
      const pdf = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '16mm', bottom: '18mm', left: '14mm', right: '14mm' },
        displayHeaderFooter: true,
        headerTemplate: '<span></span>',
        footerTemplate: `<div style="width:100%;padding:0 14mm;display:flex;justify-content:space-between;font-family:Arial,sans-serif;font-size:8px;color:#8a938d"><span>Rastro · ${escapeHtml(report.session.objective.sessionName)}</span><span>Página <span class="pageNumber"></span> de <span class="totalPages"></span></span></div>`,
      });
      return new Uint8Array(pdf);
    } finally {
      await browser.close();
    }
  }
}
