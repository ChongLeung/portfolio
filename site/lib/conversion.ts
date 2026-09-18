import { PDFDocument, PDFName, degrees } from 'pdf-lib';
import { zipSync, strToU8 } from 'fflate';
import { stringify as yaml } from 'yaml';
import { parseUniqueJson } from './model.ts';

export const conversionLimit = 25 * 1024 * 1024;
export const adapters = [
  {
    id: 'json-format',
    category: 'Structured data',
    name: 'JSON: format',
    source: 'json',
    extension: 'json',
    mime: 'application/json',
    note: 'Preserves parsed data; formatting and original key spacing change.',
  },
  {
    id: 'json-yaml',
    category: 'Structured data',
    name: 'JSON to YAML',
    source: 'json',
    extension: 'yaml',
    mime: 'application/yaml',
    note: 'Produces YAML 1.2 from validated JSON data.',
  },
  {
    id: 'text-base64',
    category: 'Binary encodings',
    name: 'UTF-8 text to Base64',
    source: 'text',
    extension: 'txt',
    mime: 'text/plain',
    note: 'Encodes UTF-8 bytes. Base64 is not encryption.',
  },
  {
    id: 'base64-text',
    category: 'Binary encodings',
    name: 'Base64 to UTF-8 text',
    source: 'base64',
    extension: 'txt',
    mime: 'text/plain',
    note: 'Rejects invalid Base64 and invalid UTF-8 bytes.',
  },
  {
    id: 'text-zip',
    category: 'Archives',
    name: 'Text to ZIP',
    source: 'text',
    extension: 'zip',
    mime: 'application/zip',
    note: 'Creates an unencrypted ZIP with one UTF-8 text entry.',
  },
  {
    id: 'pdf-inspect',
    category: 'Documents / PDF',
    name: 'PDF: inspect',
    source: 'pdf',
    extension: 'json',
    mime: 'application/json',
    note: 'Exports page count, dimensions, rotations, and standard metadata.',
  },
  {
    id: 'pdf-extract',
    category: 'Documents / PDF',
    name: 'PDF: extract / reorder pages',
    source: 'pdf',
    extension: 'pdf',
    mime: 'application/pdf',
    note: 'Creates a new PDF from your ordered, one-based page list. Links, forms and document-level metadata may not survive.',
  },
  {
    id: 'pdf-rotate',
    category: 'Documents / PDF',
    name: 'PDF: rotate pages',
    source: 'pdf',
    extension: 'pdf',
    mime: 'application/pdf',
    note: 'Adds 90 degrees clockwise to every selected page.',
  },
  {
    id: 'pdf-split',
    category: 'Documents / PDF',
    name: 'PDF: split into a ZIP',
    source: 'pdf',
    extension: 'zip',
    mime: 'application/zip',
    note: 'Creates one PDF per page. Document-level forms, metadata and links may not survive.',
  },
  {
    id: 'pdf-metadata',
    category: 'Documents / PDF',
    name: 'PDF: clear standard metadata',
    source: 'pdf',
    extension: 'pdf',
    mime: 'application/pdf',
    note: 'Clears standard document metadata and XMP. This is not a content-redaction or forensic-sanitization tool.',
  },
] as const;
export type AdapterId = (typeof adapters)[number]['id'];
export function parsePageList(text: string, count: number): number[] {
  if (!text.trim()) return Array.from({ length: count }, (_, i) => i);
  if (text.length > 10000) throw Error('Page list is too long.');
  const pages: number[] = [];
  for (const part of text.split(',')) {
    const match = /^\s*(\d+)(?:\s*-\s*(\d+))?\s*$/.exec(part);
    if (!match) throw Error('Use page numbers or ranges, such as 1, 3-5.');
    const first = Number(match[1]),
      last = Number(match[2] ?? match[1]);
    if (first < 1 || last < first || last > count)
      throw Error('A page number or range is outside this PDF.');
    for (let value = first; value <= last; value++) {
      pages.push(value - 1);
      if (pages.length > 500)
        throw Error('A conversion supports at most 500 output pages.');
    }
  }
  return pages;
}
export async function convertFile(
  bytes: Uint8Array,
  id: AdapterId,
  pageList = '',
): Promise<Uint8Array> {
  const result = await convertInternal(bytes, id, pageList);
  if (result.byteLength > 50 * 1024 * 1024)
    throw Error('Output exceeds the 50 MiB limit.');
  return result;
}
async function convertInternal(
  bytes: Uint8Array,
  id: AdapterId,
  pageList = '',
): Promise<Uint8Array> {
  if (bytes.byteLength > conversionLimit)
    throw Error('The file exceeds the 25 MiB conversion limit.');
  const adapter = adapters.find((item) => item.id === id);
  if (!adapter) throw Error('Unknown converter.');
  const decode = () => new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  if (adapter.source === 'json') {
    const value = parseUniqueJson(decode(), conversionLimit);
    return strToU8(
      id === 'json-yaml' ? yaml(value) : JSON.stringify(value, null, 2) + '\n',
    );
  }
  if (id === 'text-base64') {
    decode();
    let binary = '';
    for (let index = 0; index < bytes.length; index += 8192)
      binary += String.fromCharCode(...bytes.subarray(index, index + 8192));
    return strToU8(btoa(binary));
  }
  if (id === 'base64-text') {
    const text = decode().replace(/\s/g, '');
    if (
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
        text,
      )
    )
      throw Error('Invalid Base64.');
    const result = Uint8Array.from(atob(text), (character) =>
      character.charCodeAt(0),
    );
    new TextDecoder('utf-8', { fatal: true }).decode(result);
    return result;
  }
  if (id === 'text-zip') {
    const text = decode();
    return zipSync({ 'document.txt': strToU8(text) }, { level: 6 });
  }
  if (new TextDecoder().decode(bytes.subarray(0, 5)) !== '%PDF-')
    throw Error('The selected file does not have a PDF signature.');
  const source = await PDFDocument.load(bytes, { updateMetadata: false });
  const count = source.getPageCount();
  if (count > 500)
    throw Error('This browser adapter supports PDFs of at most 500 pages.');
  const selected = parsePageList(pageList, count);
  if (id === 'pdf-inspect')
    return strToU8(
      JSON.stringify(
        {
          pages: source
            .getPages()
            .map((page, i) => ({
              page: i + 1,
              ...page.getSize(),
              rotation: page.getRotation().angle,
            })),
          pageCount: count,
          title: source.getTitle() ?? null,
          author: source.getAuthor() ?? null,
          subject: source.getSubject() ?? null,
        },
        null,
        2,
      ),
    );
  if (id === 'pdf-split') {
    const files: Record<string, Uint8Array> = {};
    let total = 0;
    for (let i = 0; i < count; i++) {
      const output = await PDFDocument.create();
      const [page] = await output.copyPages(source, [i]);
      output.addPage(page);
      const data = await output.save();
      if ((await PDFDocument.load(data)).getPageCount() !== 1)
        throw Error('Split output validation failed.');
      total += data.length;
      if (total > 50 * 1024 * 1024)
        throw Error('Output would exceed the 50 MiB limit.');
      files[`page-${String(i + 1).padStart(3, '0')}.pdf`] = data;
    }
    return zipSync(files, { level: 6 });
  }
  let output = source;
  if (id === 'pdf-extract') {
    output = await PDFDocument.create();
    for (const page of await output.copyPages(source, selected))
      output.addPage(page);
  }
  if (id === 'pdf-rotate')
    for (const i of new Set(selected)) {
      const page = output.getPage(i);
      page.setRotation(degrees((page.getRotation().angle + 90) % 360));
    }
  if (id === 'pdf-metadata') {
    output.context.trailerInfo.Info = undefined;
    output.catalog.delete(PDFName.of('Metadata'));
  }
  const result = await output.save();
  if (result.length > 50 * 1024 * 1024)
    throw Error('Output exceeds the 50 MiB limit.');
  const reopened = await PDFDocument.load(result, { updateMetadata: false });
  if (
    reopened.getPageCount() !== (id === 'pdf-extract' ? selected.length : count)
  )
    throw Error('Output page-count validation failed.');
  return result;
}
