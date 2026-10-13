import { escapeHtml } from '../reportDiagramModel';

export interface TocEntry { level: number; number: string; title: string; id: string }
export interface ListEntry { number: number; id: string; caption: string }
export interface FigureAccountingEntry { figure: number; caption: string; omitted: number; note: string }

export interface TableSpec {
  caption: string;
  /** Header cells, already-escaped HTML. */
  head: string[];
  /** Body rows; every cell is already-escaped HTML. A row may be `{ cells, className }`. */
  rows: (string[] | { cells: string[]; className?: string })[];
  className?: string;
}

/** Anchor id for a section number: `5.2.1` -> `sec-5-2-1`, `A` -> `sec-A`. */
export function sectionId(number: string): string {
  return `sec-${number.replace(/[^A-Za-z0-9]+/g, '-')}`;
}

/**
 * Section / figure / table numbering for one report. Everything is registered in document order, so the
 * lists built from it (TOC, list of figures, list of tables, omitted-connection appendix) match the body.
 */
export class ReportNumbering {
  readonly toc: TocEntry[] = [];
  readonly figures: ListEntry[] = [];
  readonly tables: ListEntry[] = [];
  readonly accounting: FigureAccountingEntry[] = [];
  private figureCount = 0;
  private tableCount = 0;

  /** A numbered heading (`level` 2 = h2). `number` is explicit so cross-links can be computed before the body is rendered. */
  heading(level: number, number: string, title: string, extraClass = '', display = number): string {
    const tag = `h${Math.min(6, Math.max(2, level))}`;
    const id = sectionId(number);
    this.toc.push({ level, number: display, title, id });
    const cls = extraClass ? ` class="${extraClass}"` : '';
    return `<${tag} id="${id}"${cls}><span class="sec-no">${escapeHtml(display)}</span> ${escapeHtml(title)}</${tag}>`;
  }

  /**
   * Gives every drawn figure in `html` a sequential number and an id, and prefixes its caption with
   * "Figure N —". Empty-figure placeholders keep no number. Returns the rewritten html.
   */
  numberFigures(html: string): string {
    return html.replace(/<figure class="report-figure([^"]*)"([^>]*)>([\s\S]*?)<\/figure>/g, (whole, cls: string, attrs: string, inner: string) => {
      if (cls.includes('report-figure-empty')) return whole;
      const number = ++this.figureCount;
      const id = `fig-${number}`;
      let captionHtml = '';
      const rewritten = inner.replace(/<figcaption class="report-figure-caption">([\s\S]*?)<\/figcaption>/, (_m, cap: string) => {
        captionHtml = cap;
        return `<figcaption class="report-figure-caption"><strong>Figure ${number} &#8212;</strong> ${cap}</figcaption>`;
      });
      this.figures.push({ number, id, caption: captionHtml });
      // Several figures can draw the same relationship or share marker definitions; keep ids unique in the
      // document so every url(#marker) and textPath reference resolves inside its own figure.
      const localIds = new Set([...inner.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]));
      const scoped = localIds.size === 0 ? rewritten : rewritten.replace(
        /(\sid="|url\(#|\shref="#|xlink:href="#)([^")\s]+)/g,
        (m: string, pre: string, ref: string) => (localIds.has(ref) ? `${pre}fig${number}-${ref}` : m),
      );
      const omittedMatch = /data-omitted-edges="(\d+)"/.exec(attrs);
      const omitted = omittedMatch ? Number(omittedMatch[1]) : 0;
      if (omitted > 0) {
        const note = /<p class="report-figure-omitted">([\s\S]*?)<\/p>/.exec(inner);
        this.accounting.push({ figure: number, caption: captionHtml, omitted, note: note ? note[1] : '' });
      }
      return `<figure class="report-figure${cls}" id="${id}"${attrs}>${scoped}</figure>`;
    });
  }

  /** A numbered table with a repeating `thead`. */
  table(spec: TableSpec): string {
    const number = ++this.tableCount;
    const id = `tbl-${number}`;
    this.tables.push({ number, id, caption: escapeHtml(spec.caption) });
    const cls = `data${spec.className ? ` ${spec.className}` : ''}`;
    const head = `<thead><tr>${spec.head.map(h => `<th>${h}</th>`).join('')}</tr></thead>`;
    const body = spec.rows.map(row => {
      const cells = Array.isArray(row) ? row : row.cells;
      const rowClass = Array.isArray(row) || !row.className ? '' : ` class="${row.className}"`;
      return `<tr${rowClass}>${cells.map(c => `<td>${c}</td>`).join('')}</tr>`;
    }).join('');
    return `<table class="${cls}" id="${id}"><caption><strong>Table ${number} &#8212;</strong> ${escapeHtml(spec.caption)}</caption>${head}<tbody>${body}</tbody></table>`;
  }

  /**
   * Numbers the `<h3>` headings of App-supplied section html below `base` (`9.1` -> `9.1.1`, ...) so they appear
   * in the contents; `<h4>` headings are left as plain sub-headings.
   */
  numberSubheadings(html: string, base: string, level = 3): string {
    let count = 0;
    return html.replace(/<h3>([\s\S]*?)<\/h3>/g, (_m, text: string) => {
      const number = `${base}.${++count}`;
      const id = sectionId(number);
      const plain = text.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&');
      this.toc.push({ level, number, title: plain, id });
      return `<h${level} id="${id}"><span class="sec-no">${escapeHtml(number)}</span> ${text}</h${level}>`;
    });
  }

  listOfFigures(): string {
    if (this.figures.length === 0) return '<p class="not-modelled">No figures.</p>';
    return `<ol class="lof">${this.figures.map(f => `<li><a href="#${f.id}">Figure ${f.number} &#8212; ${f.caption}</a></li>`).join('')}</ol>`;
  }

  listOfTables(): string {
    if (this.tables.length === 0) return '<p class="not-modelled">No tables.</p>';
    return `<ol class="lot">${this.tables.map(t => `<li><a href="#${t.id}">Table ${t.number} &#8212; ${t.caption}</a></li>`).join('')}</ol>`;
  }

  tableOfContents(): string {
    return `<ol class="toc">${this.toc.map(e =>
      `<li class="toc-l${Math.min(e.level, 6)}"><a href="#${e.id}"><span class="toc-no">${escapeHtml(e.number)}</span> ${escapeHtml(e.title)}</a></li>`).join('')}</ol>`;
  }
}

export function notModelled(): string {
  return '<p class="not-modelled">Not modelled in this project.</p>';
}
