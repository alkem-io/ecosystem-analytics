import ExcelJS from 'exceljs';
import { toPng } from 'html-to-image';
import type { VngDashboardResponse } from '@server/types/api.js';

interface ChartCapture {
  /** Sheet/section title for the chart. */
  title: string;
  /** The DOM node to rasterise (the chart card). */
  node: HTMLElement | null;
}

interface ExportArgs {
  data: VngDashboardResponse;
  /** Charts to embed as images (captured from the live DOM). */
  charts: ChartCapture[];
  /** i18n category-label resolver, e.g. (ns, key) => localized label. */
  labelOf: (namespace: string, key: string) => string;
  filename: string;
  /** Localised column/section headings. */
  text: {
    sheetData: string;
    sheetCharts: string;
    category: string;
    count: string;
    initiatives: string;
    nds: string;
    vng2030: string;
    gemeenteDistribution: string;
    bucket: string;
    groei: string;
    gd: string;
    total: string;
    /** Label for the leading 0-gemeente bucket. */
    noClassification: string;
  };
}

/** Capture a DOM node to a PNG data URL (resolves CSS variables / computed styles). */
async function capture(node: HTMLElement): Promise<string | null> {
  try {
    return await toPng(node, { backgroundColor: '#ffffff', pixelRatio: 2, cacheBust: true });
  } catch {
    return null;
  }
}

/**
 * Build and download an .xlsx of the dashboard: the displayed data as tables plus
 * the rendered charts as images. Runs entirely client-side.
 */
export async function exportDashboardXlsx({ data, charts, labelOf, filename, text }: ExportArgs): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'VNG Kenniscentrum Innovatie';
  wb.created = new Date();

  // ---- Data sheet -------------------------------------------------------
  const ds = wb.addWorksheet(text.sheetData);
  const titleRow = (label: string) => {
    const r = ds.addRow([label]);
    r.font = { bold: true, size: 13 };
    ds.addRow([]);
  };
  const headerRow = (cells: string[]) => {
    const r = ds.addRow(cells);
    r.font = { bold: true };
    r.eachCell((c) => {
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EDF1' } };
      c.border = { bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } } };
    });
  };

  const dimension = (key: string, label: string) => {
    const dim = data.dimensions.find((d) => d.key === key);
    if (!dim) return;
    titleRow(label);
    headerRow([text.category, text.count, text.initiatives]);
    for (const c of dim.categories) {
      ds.addRow([labelOf(`categories.${key}`, c.key), c.count, c.items.join(', ')]);
    }
    ds.addRow([]);
    ds.addRow([]);
  };

  dimension('nds', text.nds);
  dimension('vng2030', text.vng2030);

  if (data.gemeenteDistribution) {
    titleRow(text.gemeenteDistribution);
    headerRow([text.bucket, text.groei, text.gd, text.total, text.initiatives]);
    for (const b of data.gemeenteDistribution.buckets) {
      ds.addRow([
        b.key === 'none' ? text.noClassification : b.key,
        b.groei,
        b.gd,
        b.groei + b.gd,
        [...b.groeiItems, ...b.gdItems].join(', '),
      ]);
    }
  }

  ds.columns.forEach((col, i) => {
    col.width = i === 0 ? 36 : i < 4 ? 12 : 80;
  });

  // ---- Charts sheet -----------------------------------------------------
  const cs = wb.addWorksheet(text.sheetCharts);
  let row = 1;
  for (const chart of charts) {
    if (!chart.node) continue;
    const dataUrl = await capture(chart.node);
    cs.getCell(`A${row}`).value = chart.title;
    cs.getCell(`A${row}`).font = { bold: true, size: 12 };
    row += 1;
    if (dataUrl) {
      const imageId = wb.addImage({ base64: dataUrl, extension: 'png' });
      // ~ keep aspect; cards are roughly 2:1. Place from the current row.
      cs.addImage(imageId, {
        tl: { col: 0, row },
        ext: { width: 720, height: 380 },
      });
      row += 22; // leave space below the image for the next chart
    } else {
      cs.getCell(`A${row}`).value = '(chart image unavailable)';
      row += 2;
    }
  }
  cs.getColumn(1).width = 30;

  // ---- Download ---------------------------------------------------------
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
