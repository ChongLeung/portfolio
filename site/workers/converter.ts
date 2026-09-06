import { convertFile } from '../lib/conversion';
self.onmessage = async ({ data }) => {
  try {
    const output = await convertFile(
      new Uint8Array(data.bytes),
      data.adapter,
      data.pages,
    );
    self.postMessage(
      { ok: true, bytes: output },
      { transfer: [output.buffer] },
    );
  } catch (error) {
    self.postMessage({
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : 'Conversion could not be completed.',
    });
  }
};
