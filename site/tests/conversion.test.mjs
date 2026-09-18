import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import { unzipSync } from 'fflate';
import { parse as parseYaml } from 'yaml';
import { convertFile, parsePageList } from '../lib/conversion.ts';
const encode = (text) => new TextEncoder().encode(text);
const decode = (bytes) => new TextDecoder().decode(bytes);
async function document() {
  const doc = await PDFDocument.create();
  doc.addPage([200, 300]);
  doc.addPage([400, 500]);
  doc.addPage([600, 700]);
  doc.setTitle('Neutral test document');
  doc.setAuthor('Synthetic author');
  return doc.save();
}

test('JSON format and YAML preserve parsed data', async () => {
  const value = { title: 'Hello', count: 3, enabled: true, items: [null, 2] };
  const source = encode(JSON.stringify(value));
  assert.deepEqual(
    JSON.parse(decode(await convertFile(source, 'json-format'))),
    value,
  );
  assert.deepEqual(
    parseYaml(decode(await convertFile(source, 'json-yaml'))),
    value,
  );
});
test('malformed and duplicate-key JSON are refused', async () => {
  await assert.rejects(
    convertFile(encode('{"a":1,"a":2}'), 'json-format'),
    /Duplicate/,
  );
  await assert.rejects(convertFile(encode('{'), 'json-yaml'));
});
test('Base64 round-trips Unicode and rejects malformed input and invalid UTF-8', async () => {
  const source = encode('Hello 世界');
  const base64 = await convertFile(source, 'text-base64');
  assert.deepEqual(await convertFile(base64, 'base64-text'), source);
  await assert.rejects(
    convertFile(encode('%%%'), 'base64-text'),
    /Invalid Base64/,
  );
  await assert.rejects(convertFile(encode('/w=='), 'base64-text'));
});
test('ZIP output can be reopened with exactly the intended text entry', async () => {
  const zip = await convertFile(encode('A neutral document.'), 'text-zip');
  const files = unzipSync(zip);
  assert.deepEqual(Object.keys(files), ['document.txt']);
  assert.equal(decode(files['document.txt']), 'A neutral document.');
});
test('PDF inspection reports real page sizes, rotations and metadata', async () => {
  const result = JSON.parse(
    decode(await convertFile(await document(), 'pdf-inspect')),
  );
  assert.equal(result.pageCount, 3);
  assert.equal(result.title, 'Neutral test document');
  assert.equal(result.pages[1].width, 400);
  assert.equal(result.pages[1].rotation, 0);
});
test('PDF extraction preserves requested order and duplicates', async () => {
  const result = await PDFDocument.load(
    await convertFile(await document(), 'pdf-extract', '3,1,1'),
    { updateMetadata: false },
  );
  assert.deepEqual(
    result.getPages().map((page) => page.getWidth()),
    [600, 200, 200],
  );
});
test('PDF rotation affects selected pages once even if the list repeats them', async () => {
  const result = await PDFDocument.load(
    await convertFile(await document(), 'pdf-rotate', '2,2'),
    { updateMetadata: false },
  );
  assert.deepEqual(
    result.getPages().map((page) => page.getRotation().angle),
    [0, 90, 0],
  );
});
test('PDF split ZIP contains independently readable single-page PDFs', async () => {
  const files = unzipSync(await convertFile(await document(), 'pdf-split'));
  assert.equal(Object.keys(files).length, 3);
  for (let i = 0; i < 3; i++) {
    const doc = await PDFDocument.load(files[`page-00${i + 1}.pdf`]);
    assert.equal(doc.getPageCount(), 1);
    assert.equal(doc.getPage(0).getWidth(), (i + 1) * 200);
  }
});
test('PDF metadata clearing removes standard Info data and retains pages', async () => {
  const result = await PDFDocument.load(
    await convertFile(await document(), 'pdf-metadata'),
    { updateMetadata: false },
  );
  assert.equal(result.getTitle(), undefined);
  assert.equal(result.getAuthor(), undefined);
  assert.equal(result.getCreationDate(), undefined);
  assert.equal(result.getPageCount(), 3);
});
test('page selections and signatures fail closed', async () => {
  for (const range of ['0', '4', '3-1', '1,', 'x', '1-900'])
    assert.throws(() => parsePageList(range, 3));
  assert.deepEqual(parsePageList('1, 2-3', 3), [0, 1, 2]);
  await assert.rejects(
    convertFile(encode('not a PDF'), 'pdf-inspect'),
    /signature/,
  );
  await assert.rejects(
    convertFile(new Uint8Array(25 * 1024 * 1024 + 1), 'text-zip'),
    /limit/,
  );
});
