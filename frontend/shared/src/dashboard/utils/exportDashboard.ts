import type { toPng as ToPng } from 'html-to-image';
import type { VngDashboardResponse } from '@server/types/api.js';

// `exceljs` (~940 kB minified) and `html-to-image` are pulled in lazily inside
// exportDashboardXlsx() below — they're only needed when the user clicks Export,
// so a static import would bloat the initial bundle for every visitor. Keeping
// the imports dynamic lets the bundler split them into an on-demand chunk.

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
  /**
   * Localise a synthetic bucket that has no Alkemio label (feature 020). Real category
   * names come off the payload verbatim and are never passed through here (FR-024).
   */
  uncategorisedLabel: string;
  noPhaseLabel: string;
  /** XLSX workbook creator/author (per-app, from AppConfig). */
  creator: string;
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
    /** Heading for the growth-phase table. */
    phases: string;
    /** Column heading for the phase name. */
    phase: string;
    bucket: string;
    groei: string;
    gd: string;
    total: string;
    /** Label for the leading 0-gemeente bucket. */
    noClassification: string;
    /** Heading for the city population × participation table (feature 018). */
    cityPopulation: string;
    city: string;
    province: string;
    population: string;
    participating: string;
    yes: string;
    no: string;
    /** Already-interpolated "N cities with unknown population were excluded". */
    cityExcluded: string;
  };
}

/** Capture a DOM node to a PNG data URL (resolves CSS variables / computed styles). */
async function capture(node: HTMLElement, toPng: typeof ToPng): Promise<string | null> {
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
export async function exportDashboardXlsx({
  data,
  charts,
  uncategorisedLabel,
  noPhaseLabel,
  creator,
  filename,
  text,
}: ExportArgs): Promise<void> {
  // Load the heavy export-only libraries on demand (see note at top of file).
  const [{ default: ExcelJS }, { toPng }] = await Promise.all([
    import('exceljs'),
    import('html-to-image'),
  ]);

  const wb = new ExcelJS.Workbook();
  wb.creator = creator;
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
      ds.addRow([c.label ?? uncategorisedLabel, c.count, c.items.join(', ')]);
    }
    ds.addRow([]);
    ds.addRow([]);
  };

  if (data.phaseDistribution) {
    titleRow(text.phases);
    headerRow([text.phase, text.count, text.initiatives]);
    for (const p of data.phaseDistribution.phases) {
      ds.addRow([p.label ?? noPhaseLabel, p.count, p.items.join(', ')]);
    }
    ds.addRow([]);
    ds.addRow([]);
  }

  dimension('nds', text.nds);
  dimension('vng2030', text.vng2030);

  if (data.gemeenteDistribution) {
    titleRow(text.gemeenteDistribution);
    headerRow([text.bucket, text.groei, text.gd, text.total, text.initiatives]);
    for (const b of data.gemeenteDistribution.buckets) {
      ds.addRow([
        // The "none" bucket = 0 associated gemeentes → label it "0", not "no classification".
        b.key === 'none' ? '0' : b.key,
        b.groei,
        b.gd,
        b.groei + b.gd,
        [...b.groeiItems, ...b.gdItems].join(', '),
      ]);
    }
  }

  // Population × participation, one row per plotted municipality (feature 018, FR-025).
  // Municipalities excluded for unknown population are not rows, so their count is
  // stated instead — the same disclosure the chart makes.
  if (data.cityPopulation) {
    const { participating, nonParticipating, excludedUnknownPopulation } = data.cityPopulation;
    ds.addRow([]);
    ds.addRow([]);
    titleRow(text.cityPopulation);
    headerRow([text.city, text.province, text.population, text.count, text.participating]);
    const rows = [
      ...participating.map((p) => ({ p, participating: true })),
      ...nonParticipating.map((p) => ({ p, participating: false })),
    ].sort((a, b) => b.p.population - a.p.population || a.p.name.localeCompare(b.p.name));
    for (const { p, participating: isParticipating } of rows) {
      ds.addRow([
        p.name,
        p.provinceName ?? '',
        p.population,
        p.initiativeCount,
        isParticipating ? text.yes : text.no,
      ]);
    }
    if (excludedUnknownPopulation > 0) {
      ds.addRow([]);
      ds.addRow([text.cityExcluded]);
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
    const dataUrl = await capture(chart.node, toPng);
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
  await downloadWorkbook(wb, filename);
}

/** Serialise a workbook and trigger a browser download. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function downloadWorkbook(wb: any, filename: string): Promise<void> {
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

/** A single chart's raw data, ready to write as one sheet. */
export interface ChartTable {
  columns: string[];
  rows: (string | number)[][];
}

/**
 * Export ONE dashboard chart as its own .xlsx: a Data sheet with that chart's raw
 * table plus a Chart sheet with the rendered chart image. Used by the per-chart
 * download buttons (the whole-dashboard workbook stays available separately).
 */
export async function exportSingleChartXlsx(opts: {
  title: string;
  node: HTMLElement | null;
  table: ChartTable | null;
  creator: string;
  filename: string;
  sheetDataName: string;
  sheetChartName: string;
}): Promise<void> {
  const { title, node, table, creator, filename, sheetDataName, sheetChartName } = opts;
  const [{ default: ExcelJS }, { toPng }] = await Promise.all([
    import('exceljs'),
    import('html-to-image'),
  ]);

  const wb = new ExcelJS.Workbook();
  wb.creator = creator;
  wb.created = new Date();

  // ---- Data sheet -------------------------------------------------------
  const ds = wb.addWorksheet(sheetDataName);
  const tr = ds.addRow([title]);
  tr.font = { bold: true, size: 13 };
  ds.addRow([]);
  if (table && table.rows.length > 0) {
    const hr = ds.addRow(table.columns);
    hr.font = { bold: true };
    hr.eachCell((c) => {
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EDF1' } };
      c.border = { bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } } };
    });
    for (const r of table.rows) ds.addRow(r);
    const last = table.columns.length - 1;
    ds.columns.forEach((col, i) => {
      col.width = i === 0 ? 40 : i === last ? 80 : 14;
    });
  }

  // ---- Chart sheet ------------------------------------------------------
  const cs = wb.addWorksheet(sheetChartName);
  const dataUrl = node ? await capture(node, toPng) : null;
  if (dataUrl) {
    const imageId = wb.addImage({ base64: dataUrl, extension: 'png' });
    cs.addImage(imageId, { tl: { col: 0, row: 0 }, ext: { width: 900, height: 460 } });
  } else {
    cs.getCell('A1').value = '(chart image unavailable)';
  }

  await downloadWorkbook(wb, filename);
}
