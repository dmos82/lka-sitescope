/**
 * Export Routes — /api/export
 *
 * GET /api/export/excel/:analysisId  — XLSX download
 * GET /api/export/pdf/:analysisId    — PDF download (HTML-based)
 * GET /api/export/pptx/:analysisId   — PPTX download
 */

import { Router, Response } from 'express';
import ExcelJS from 'exceljs';
import PptxGenJS from 'pptxgenjs';
import { prisma } from '@lka/database';
import { protect, asyncHandler, AuthRequest } from '../middleware/protect';

interface PartnerItem {
  id: string;
  name: string;
  category: string;
  sub_type: string | null;
  address: string | null;
  phone: string | null;
  distance_miles: number | null;
  status: string;
  notes: string | null;
}

const router = Router();

// ─── LKA Brand Colors ────────────────────────────────────────────────────────
const LKA = {
  darkBlue: '1B3A6B',
  gold: 'C9A84C',
  white: 'FFFFFF',
  lightGrey: 'F5F5F5',
  darkGrey: '444444',
};

// ─── Shared Helpers ─────────────────────────────────────────────────────────
async function fetchAnalysis(id: string, userId: string) {
  return prisma.savedAnalysis.findFirst({
    where: { id, user_id: userId },
    include: { partners: true },
  });
}

function gradeColor(grade: string | null): string {
  switch (grade) {
    case 'A+': case 'A': return '22c55e';
    case 'A-': case 'B+': return '84cc16';
    case 'B': case 'B-': return 'eab308';
    case 'C+': case 'C': return 'f97316';
    default: return 'ef4444';
  }
}

// ─── Step 10: Excel Export ───────────────────────────────────────────────────

/**
 * GET /api/export/excel/:analysisId
 * Generates a multi-sheet Excel workbook with analysis data.
 */
router.get(
  '/excel/:analysisId',
  protect,
  asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    const analysis = await fetchAnalysis(req.params.analysisId, req.user!.sub);
    if (!analysis) {
      res.status(404).json({ error: 'Analysis not found' });
      return;
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'LKA SiteScope';
    workbook.created = new Date();

    // ── Sheet 1: Summary ──────────────────────────────────────────────────
    const summary = workbook.addWorksheet('Summary');
    summary.columns = [
      { header: 'Field', key: 'field', width: 28 },
      { header: 'Value', key: 'value', width: 40 },
    ];

    // Header row styling
    summary.getRow(1).eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${LKA.darkBlue}` } };
      cell.font = { color: { argb: `FF${LKA.white}` }, bold: true };
    });

    const breakdown = analysis.score_breakdown as Record<string, unknown> | null;

    const summaryRows = [
      ['Address', analysis.address],
      ['Country', analysis.country],
      ['Score', analysis.score?.toFixed(1) ?? 'N/A'],
      ['Grade', analysis.letter_grade ?? 'N/A'],
      ['Trade Area (miles)', analysis.trade_area_miles],
      ['Income Threshold', `$${(analysis.income_threshold ?? 0).toLocaleString()}`],
      ['Analysis Date', new Date(analysis.created_at).toLocaleDateString()],
    ];

    summaryRows.forEach(([field, value]) => summary.addRow({ field, value }));

    // Alternate row shading
    summary.eachRow((row, rowNumber) => {
      if (rowNumber > 1 && rowNumber % 2 === 0) {
        row.eachCell((cell) => {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${LKA.lightGrey}` } };
        });
      }
    });

    // ── Sheet 2: Score Breakdown ───────────────────────────────────────────
    if (breakdown) {
      const scoreSheet = workbook.addWorksheet('Score Breakdown');
      scoreSheet.columns = [
        { header: 'Factor', key: 'factor', width: 32 },
        { header: 'Score', key: 'score', width: 12 },
        { header: 'Weight', key: 'weight', width: 12 },
        { header: 'Weighted Score', key: 'weighted', width: 16 },
      ];

      scoreSheet.getRow(1).eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${LKA.darkBlue}` } };
        cell.font = { color: { argb: `FF${LKA.white}` }, bold: true };
      });

      for (const [key, val] of Object.entries(breakdown)) {
        if (typeof val === 'object' && val !== null) {
          const v = val as { score?: number; weight?: number; weighted?: number };
          scoreSheet.addRow({
            factor: key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
            score: v.score?.toFixed(1) ?? '',
            weight: v.weight ? `${(v.weight * 100).toFixed(0)}%` : '',
            weighted: v.weighted?.toFixed(1) ?? '',
          });
        }
      }
    }

    // ── Sheet 3: Demographics ─────────────────────────────────────────────
    const demo = analysis.demographics_snapshot as Record<string, unknown> | null;
    if (demo) {
      const demoSheet = workbook.addWorksheet('Demographics');
      demoSheet.columns = [
        { header: 'Metric', key: 'metric', width: 32 },
        { header: 'Value', key: 'value', width: 20 },
      ];

      demoSheet.getRow(1).eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${LKA.darkBlue}` } };
        cell.font = { color: { argb: `FF${LKA.white}` }, bold: true };
      });

      const demoRows: [string, string][] = [
        ['Population', (demo.population as number)?.toLocaleString() ?? 'N/A'],
        ['Median Household Income', demo.median_household_income ? `$${(demo.median_household_income as number).toLocaleString()}` : 'N/A'],
        ['Households', (demo.households as number)?.toLocaleString() ?? 'N/A'],
        ['Households Above Threshold', (demo.households_above_threshold as number)?.toLocaleString() ?? 'N/A'],
        ['% Above Threshold', demo.pct_above_threshold ? `${(demo.pct_above_threshold as number).toFixed(1)}%` : 'N/A'],
        ['Median Home Value', demo.median_home_value ? `$${(demo.median_home_value as number).toLocaleString()}` : 'N/A'],
        ['% With Children', demo.pct_with_children ? `${(demo.pct_with_children as number).toFixed(1)}%` : 'N/A'],
        ['% College Educated', demo.pct_college_educated ? `${(demo.pct_college_educated as number).toFixed(1)}%` : 'N/A'],
        ['Source', (demo.source as string) ?? 'N/A'],
      ];

      demoRows.forEach(([metric, value]) => demoSheet.addRow({ metric, value }));
    }

    // ── Sheet 4: Partners ─────────────────────────────────────────────────
    if (analysis.partners.length > 0) {
      const partnerSheet = workbook.addWorksheet('Partners');
      partnerSheet.columns = [
        { header: 'Name', key: 'name', width: 30 },
        { header: 'Category', key: 'category', width: 16 },
        { header: 'Sub Type', key: 'sub_type', width: 20 },
        { header: 'Address', key: 'address', width: 36 },
        { header: 'Distance (mi)', key: 'distance', width: 14 },
        { header: 'Status', key: 'status', width: 16 },
        { header: 'Phone', key: 'phone', width: 16 },
      ];

      partnerSheet.getRow(1).eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${LKA.darkBlue}` } };
        cell.font = { color: { argb: `FF${LKA.white}` }, bold: true };
      });

      for (const p of analysis.partners) {
        partnerSheet.addRow({
          name: p.name,
          category: p.category,
          sub_type: p.sub_type ?? '',
          address: p.address ?? '',
          distance: p.distance_miles?.toFixed(2) ?? '',
          status: p.status,
          phone: p.phone ?? '',
        });
      }
    }

    // Stream to response
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="lka-analysis-${analysis.id.slice(0, 8)}.xlsx"`);
    await workbook.xlsx.write(res);
    res.end();
  })
);

// ─── Step 11: PDF Export ─────────────────────────────────────────────────────

/**
 * GET /api/export/pdf/:analysisId
 * Generates an HTML-based PDF report (returned as HTML for browser printing).
 * For true PDF generation, pipe through puppeteer or wkhtmltopdf in production.
 */
router.get(
  '/pdf/:analysisId',
  protect,
  asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    const analysis = await fetchAnalysis(req.params.analysisId, req.user!.sub);
    if (!analysis) {
      res.status(404).json({ error: 'Analysis not found' });
      return;
    }

    const demo = analysis.demographics_snapshot as Record<string, unknown> | null;
    const breakdown = analysis.score_breakdown as Record<string, unknown> | null;
    const scoreColor = gradeColor(analysis.letter_grade);

    const partnerRows = analysis.partners
      .slice(0, 20)
      .map(
        (p: PartnerItem) =>
          `<tr>
            <td>${escHtml(p.name)}</td>
            <td>${escHtml(p.category)}</td>
            <td>${p.distance_miles?.toFixed(2) ?? ''} mi</td>
            <td><span class="status status-${p.status}">${escHtml(p.status.replace(/_/g, ' '))}</span></td>
          </tr>`
      )
      .join('');

    const breakdownRows = breakdown
      ? Object.entries(breakdown)
          .filter(([, v]) => typeof v === 'object' && v !== null)
          .map(([key, v]) => {
            const val = v as { score?: number; weight?: number; weighted?: number };
            return `<tr>
              <td>${key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}</td>
              <td>${val.score?.toFixed(1) ?? '-'}</td>
              <td>${val.weight ? `${(val.weight * 100).toFixed(0)}%` : '-'}</td>
              <td>${val.weighted?.toFixed(1) ?? '-'}</td>
            </tr>`;
          })
          .join('')
      : '';

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>LKA SiteScope Analysis — ${escHtml(analysis.address)}</title>
  <style>
    @page { margin: 0.75in; size: letter; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 11pt; color: #${LKA.darkGrey}; }
    .header { background: #${LKA.darkBlue}; color: #fff; padding: 24px 32px; display: flex; justify-content: space-between; align-items: center; }
    .header h1 { font-size: 22pt; letter-spacing: -0.5px; }
    .header .subtitle { font-size: 10pt; opacity: 0.8; margin-top: 4px; }
    .grade-badge { background: #${scoreColor}; color: #fff; border-radius: 50%; width: 72px; height: 72px; display: flex; align-items: center; justify-content: center; font-size: 28pt; font-weight: bold; }
    .section { padding: 20px 32px; border-bottom: 1px solid #e5e7eb; }
    .section-title { font-size: 14pt; font-weight: bold; color: #${LKA.darkBlue}; margin-bottom: 12px; padding-bottom: 6px; border-bottom: 2px solid #${LKA.gold}; }
    .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .meta-item { display: flex; gap: 8px; }
    .meta-label { font-weight: bold; min-width: 140px; color: #555; }
    table { width: 100%; border-collapse: collapse; font-size: 10pt; }
    th { background: #${LKA.darkBlue}; color: #fff; padding: 8px 10px; text-align: left; font-weight: 600; }
    td { padding: 7px 10px; border-bottom: 1px solid #e5e7eb; }
    tr:nth-child(even) td { background: #${LKA.lightGrey}; }
    .status { padding: 2px 8px; border-radius: 4px; font-size: 9pt; font-weight: 600; }
    .status-not_contacted { background: #e5e7eb; color: #374151; }
    .status-contacted { background: #dbeafe; color: #1d4ed8; }
    .status-interested { background: #fef3c7; color: #92400e; }
    .status-partnered { background: #d1fae5; color: #065f46; }
    .status-declined { background: #fee2e2; color: #991b1b; }
    .score-row { font-size: 18pt; font-weight: bold; color: #${LKA.darkBlue}; }
    .footer { padding: 16px 32px; font-size: 9pt; color: #888; text-align: center; }
    @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
  </style>
</head>
<body>

<div class="header">
  <div>
    <h1>LKA SiteScope</h1>
    <div class="subtitle">Franchise Site Analysis Report</div>
    <div class="subtitle" style="margin-top:8px; font-size:12pt; font-weight:600;">${escHtml(analysis.address)}</div>
  </div>
  <div class="grade-badge">${escHtml(analysis.letter_grade ?? '?')}</div>
</div>

<div class="section">
  <div class="section-title">Executive Summary</div>
  <div class="meta-grid">
    <div class="meta-item"><span class="meta-label">Address:</span> ${escHtml(analysis.address)}</div>
    <div class="meta-item"><span class="meta-label">Country:</span> ${analysis.country}</div>
    <div class="meta-item"><span class="meta-label">Overall Score:</span> <span class="score-row">${analysis.score?.toFixed(1) ?? 'N/A'} / 100</span></div>
    <div class="meta-item"><span class="meta-label">Letter Grade:</span> ${analysis.letter_grade ?? 'N/A'}</div>
    <div class="meta-item"><span class="meta-label">Trade Area:</span> ${analysis.trade_area_miles} miles</div>
    <div class="meta-item"><span class="meta-label">Income Threshold:</span> $${(analysis.income_threshold ?? 0).toLocaleString()}</div>
    <div class="meta-item"><span class="meta-label">Analysis Date:</span> ${new Date(analysis.created_at).toLocaleDateString()}</div>
  </div>
</div>

${demo ? `
<div class="section">
  <div class="section-title">Demographics</div>
  <table>
    <tr><th>Metric</th><th>Value</th></tr>
    <tr><td>Population</td><td>${(demo.population as number)?.toLocaleString() ?? 'N/A'}</td></tr>
    <tr><td>Median Household Income</td><td>${demo.median_household_income ? '$' + (demo.median_household_income as number).toLocaleString() : 'N/A'}</td></tr>
    <tr><td>Households</td><td>${(demo.households as number)?.toLocaleString() ?? 'N/A'}</td></tr>
    <tr><td>Households Above Threshold</td><td>${(demo.households_above_threshold as number)?.toLocaleString() ?? 'N/A'}</td></tr>
    <tr><td>% Above Income Threshold</td><td>${demo.pct_above_threshold ? (demo.pct_above_threshold as number).toFixed(1) + '%' : 'N/A'}</td></tr>
    <tr><td>Median Home Value</td><td>${demo.median_home_value ? '$' + (demo.median_home_value as number).toLocaleString() : 'N/A'}</td></tr>
    <tr><td>% Households with Children</td><td>${demo.pct_with_children ? (demo.pct_with_children as number).toFixed(1) + '%' : 'N/A'}</td></tr>
    <tr><td>% College Educated</td><td>${demo.pct_college_educated ? (demo.pct_college_educated as number).toFixed(1) + '%' : 'N/A'}</td></tr>
    <tr><td>Data Source</td><td>${escHtml((demo.source as string) ?? 'N/A')}</td></tr>
  </table>
</div>
` : ''}

${breakdownRows ? `
<div class="section">
  <div class="section-title">Score Breakdown</div>
  <table>
    <tr><th>Factor</th><th>Score</th><th>Weight</th><th>Weighted Score</th></tr>
    ${breakdownRows}
  </table>
</div>
` : ''}

${analysis.partners.length > 0 ? `
<div class="section">
  <div class="section-title">Partners (${analysis.partners.length})</div>
  <table>
    <tr><th>Name</th><th>Category</th><th>Distance</th><th>Status</th></tr>
    ${partnerRows}
  </table>
</div>
` : ''}

<div class="footer">
  Generated by LKA SiteScope &bull; ${new Date().toLocaleString()} &bull; Confidential
</div>

</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', `inline; filename="lka-analysis-${analysis.id.slice(0, 8)}.html"`);
    res.send(html);
  })
);

// ─── Step 12: PowerPoint Export ───────────────────────────────────────────────

/**
 * GET /api/export/pptx/:analysisId
 * Generates a PowerPoint presentation with analysis data.
 */
router.get(
  '/pptx/:analysisId',
  protect,
  asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    const analysis = await fetchAnalysis(req.params.analysisId, req.user!.sub);
    if (!analysis) {
      res.status(404).json({ error: 'Analysis not found' });
      return;
    }

    const pptx = new PptxGenJS();
    pptx.author = 'LKA SiteScope';
    pptx.company = 'LKA';
    pptx.subject = `Site Analysis — ${analysis.address}`;
    pptx.title = 'LKA SiteScope Analysis';

    const DARK_BLUE = `00${LKA.darkBlue}`;
    const GOLD = `00${LKA.gold}`;
    const WHITE = `00${LKA.white}`;

    const headerOpts: PptxGenJS.TextPropsOptions = {
      x: 0, y: 0, w: '100%', h: 0.65,
      fill: { color: DARK_BLUE },
      color: WHITE,
      bold: true,
      fontSize: 20,
      align: 'center',
      valign: 'middle',
    };

    // ── Slide 1: Title ────────────────────────────────────────────────────
    const slide1 = pptx.addSlide();
    slide1.background = { color: DARK_BLUE };

    slide1.addText('LKA SiteScope', {
      x: 0.5, y: 0.8, w: 9, h: 1,
      color: WHITE, fontSize: 36, bold: true, align: 'center',
    });

    slide1.addText('Franchise Site Analysis', {
      x: 0.5, y: 1.9, w: 9, h: 0.5,
      color: GOLD, fontSize: 18, italic: true, align: 'center',
    });

    slide1.addText(analysis.address, {
      x: 0.5, y: 2.6, w: 9, h: 0.6,
      color: WHITE, fontSize: 16, align: 'center',
    });

    if (analysis.letter_grade) {
      slide1.addText(analysis.letter_grade, {
        x: 3.8, y: 3.4, w: 2.4, h: 1.1,
        fill: { color: `00${gradeColor(analysis.letter_grade)}` },
        color: WHITE, fontSize: 48, bold: true, align: 'center', valign: 'middle',
        shape: pptx.ShapeType.ellipse,
      });
    }

    slide1.addText(new Date(analysis.created_at).toLocaleDateString(), {
      x: 0.5, y: 4.9, w: 9, h: 0.4,
      color: WHITE, fontSize: 12, align: 'center', italic: true,
    });

    // ── Slide 2: Executive Summary ────────────────────────────────────────
    const slide2 = pptx.addSlide();
    slide2.addText('LKA SiteScope', headerOpts);
    slide2.addText('Executive Summary', {
      x: 0.5, y: 0.8, w: 9, h: 0.5,
      color: DARK_BLUE, fontSize: 22, bold: true,
    });

    const summaryData = [
      ['Address', analysis.address],
      ['Country', analysis.country],
      ['Overall Score', `${analysis.score?.toFixed(1) ?? 'N/A'} / 100`],
      ['Letter Grade', analysis.letter_grade ?? 'N/A'],
      ['Trade Area', `${analysis.trade_area_miles} miles`],
      ['Income Threshold', `$${(analysis.income_threshold ?? 0).toLocaleString()}`],
    ];

    const tableRows: PptxGenJS.TableRow[] = [
      [
        { text: 'Field', options: { bold: true, fill: { color: DARK_BLUE }, color: WHITE } },
        { text: 'Value', options: { bold: true, fill: { color: DARK_BLUE }, color: WHITE } },
      ],
      ...summaryData.map(([field, value]): PptxGenJS.TableRow => [
        { text: field, options: { bold: true } },
        { text: value, options: {} },
      ]),
    ];

    slide2.addTable(tableRows, {
      x: 0.5, y: 1.4, w: 9, colW: [3, 6],
      border: { pt: 1, color: 'e5e7eb' },
      autoPage: false,
    });

    // ── Slide 3: Demographics ─────────────────────────────────────────────
    const demo = analysis.demographics_snapshot as Record<string, unknown> | null;
    if (demo) {
      const slide3 = pptx.addSlide();
      slide3.addText('LKA SiteScope', headerOpts);
      slide3.addText('Demographics', {
        x: 0.5, y: 0.8, w: 9, h: 0.5,
        color: DARK_BLUE, fontSize: 22, bold: true,
      });

      const demoData: [string, string][] = [
        ['Population', (demo.population as number)?.toLocaleString() ?? 'N/A'],
        ['Median Household Income', demo.median_household_income ? '$' + (demo.median_household_income as number).toLocaleString() : 'N/A'],
        ['Households', (demo.households as number)?.toLocaleString() ?? 'N/A'],
        ['Households Above Threshold', (demo.households_above_threshold as number)?.toLocaleString() ?? 'N/A'],
        ['% Above Income Threshold', demo.pct_above_threshold ? (demo.pct_above_threshold as number).toFixed(1) + '%' : 'N/A'],
        ['Median Home Value', demo.median_home_value ? '$' + (demo.median_home_value as number).toLocaleString() : 'N/A'],
        ['% With Children', demo.pct_with_children ? (demo.pct_with_children as number).toFixed(1) + '%' : 'N/A'],
        ['% College Educated', demo.pct_college_educated ? (demo.pct_college_educated as number).toFixed(1) + '%' : 'N/A'],
      ];

      const demoRows: PptxGenJS.TableRow[] = [
        [
          { text: 'Metric', options: { bold: true, fill: { color: DARK_BLUE }, color: WHITE } },
          { text: 'Value', options: { bold: true, fill: { color: DARK_BLUE }, color: WHITE } },
        ],
        ...demoData.map(([metric, value]): PptxGenJS.TableRow => [
          { text: metric, options: { bold: true } },
          { text: value, options: {} },
        ]),
      ];

      slide3.addTable(demoRows, {
        x: 0.5, y: 1.4, w: 9, colW: [4.5, 4.5],
        border: { pt: 1, color: 'e5e7eb' },
        autoPage: false,
      });
    }

    // ── Slide 4: Score Breakdown ──────────────────────────────────────────
    const breakdown = analysis.score_breakdown as Record<string, unknown> | null;
    if (breakdown) {
      const slide4 = pptx.addSlide();
      slide4.addText('LKA SiteScope', headerOpts);
      slide4.addText('Score Breakdown', {
        x: 0.5, y: 0.8, w: 9, h: 0.5,
        color: DARK_BLUE, fontSize: 22, bold: true,
      });

      const factors = Object.entries(breakdown).filter(([, v]) => typeof v === 'object' && v !== null);
      const breakdownRows: PptxGenJS.TableRow[] = [
        [
          { text: 'Factor', options: { bold: true, fill: { color: DARK_BLUE }, color: WHITE } },
          { text: 'Score', options: { bold: true, fill: { color: DARK_BLUE }, color: WHITE } },
          { text: 'Weight', options: { bold: true, fill: { color: DARK_BLUE }, color: WHITE } },
        ],
        ...factors.map(([key, v]): PptxGenJS.TableRow => {
          const val = v as { score?: number; weight?: number };
          return [
            { text: key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()), options: {} },
            { text: val.score?.toFixed(1) ?? '-', options: { align: 'center' } },
            { text: val.weight ? `${(val.weight * 100).toFixed(0)}%` : '-', options: { align: 'center' } },
          ];
        }),
      ];

      slide4.addTable(breakdownRows, {
        x: 0.5, y: 1.4, w: 9, colW: [5, 2, 2],
        border: { pt: 1, color: 'e5e7eb' },
        autoPage: false,
      });
    }

    // ── Slide 5: Partners ─────────────────────────────────────────────────
    if (analysis.partners.length > 0) {
      const slide5 = pptx.addSlide();
      slide5.addText('LKA SiteScope', headerOpts);
      slide5.addText(`Partners (${analysis.partners.length} identified)`, {
        x: 0.5, y: 0.8, w: 9, h: 0.5,
        color: DARK_BLUE, fontSize: 22, bold: true,
      });

      const partnerRows: PptxGenJS.TableRow[] = [
        [
          { text: 'Name', options: { bold: true, fill: { color: DARK_BLUE }, color: WHITE } },
          { text: 'Category', options: { bold: true, fill: { color: DARK_BLUE }, color: WHITE } },
          { text: 'Distance', options: { bold: true, fill: { color: DARK_BLUE }, color: WHITE } },
          { text: 'Status', options: { bold: true, fill: { color: DARK_BLUE }, color: WHITE } },
        ],
        ...analysis.partners.slice(0, 15).map((p: PartnerItem): PptxGenJS.TableRow => [
          { text: p.name, options: {} },
          { text: p.category, options: {} },
          { text: p.distance_miles ? `${p.distance_miles.toFixed(2)} mi` : '-', options: { align: 'center' } },
          { text: p.status.replace(/_/g, ' '), options: {} },
        ]),
      ];

      slide5.addTable(partnerRows, {
        x: 0.5, y: 1.4, w: 9, colW: [3.5, 2, 1.5, 2],
        border: { pt: 1, color: 'e5e7eb' },
        autoPage: false,
      });
    }

    // ── Slide 6: Recommendation ───────────────────────────────────────────
    const slide6 = pptx.addSlide();
    slide6.background = { color: DARK_BLUE };

    slide6.addText('Recommendation', {
      x: 0.5, y: 0.6, w: 9, h: 0.6,
      color: GOLD, fontSize: 24, bold: true, align: 'center',
    });

    const score = analysis.score ?? 0;
    let recommendation = 'Insufficient data to make recommendation.';
    if (score >= 80) recommendation = 'STRONG RECOMMEND — This site scores highly across all key factors. Priority location for expansion.';
    else if (score >= 65) recommendation = 'RECOMMEND — Good overall score with some areas for consideration. Solid opportunity.';
    else if (score >= 50) recommendation = 'CONDITIONAL — Average performance. Review specific factors before proceeding.';
    else recommendation = 'NOT RECOMMENDED — This location scores below threshold. Consider alternative sites.';

    slide6.addText(recommendation, {
      x: 0.5, y: 1.8, w: 9, h: 1.5,
      color: WHITE, fontSize: 16, align: 'center', valign: 'middle',
      wrap: true,
    });

    slide6.addText(`Score: ${score.toFixed(1)} / 100 — Grade: ${analysis.letter_grade ?? 'N/A'}`, {
      x: 0.5, y: 3.5, w: 9, h: 0.5,
      color: GOLD, fontSize: 20, bold: true, align: 'center',
    });

    slide6.addText('LKA SiteScope — Confidential', {
      x: 0.5, y: 4.8, w: 9, h: 0.3,
      color: WHITE, fontSize: 10, italic: true, align: 'center',
    });

    // Stream the PPTX
    const buffer = await pptx.write({ outputType: 'nodebuffer' }) as Buffer;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
    res.setHeader('Content-Disposition', `attachment; filename="lka-analysis-${analysis.id.slice(0, 8)}.pptx"`);
    res.send(buffer);
  })
);

// ─── Helpers ─────────────────────────────────────────────────────────────────
function escHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export default router;
