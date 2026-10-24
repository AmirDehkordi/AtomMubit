import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, extname } from 'node:path';
import { promisify } from 'node:util';
const exec = promisify(execFile);
export const MAX_UPLOAD = 10 * 1024 * 1024;
export async function prepareUpload(name: string, bytes: Buffer): Promise<{content: string; format: 'html'|'text'}> {
  if (!bytes.length || bytes.length > MAX_UPLOAD) throw new BadRequestException('Upload must contain 1 byte to 10 MiB.');
  const ext = extname(name).toLowerCase();
  if (ext === '.pdf') {
    if (!bytes.subarray(0, 5).equals(Buffer.from('%PDF-'))) throw new BadRequestException('Invalid PDF signature.');
    const dir = await mkdtemp(join(tmpdir(), 'desk-pdf-'));
    try {
      const path = join(dir, 'source.pdf');
      await writeFile(path, bytes, { mode: 0o600 });
      const { stdout } = await exec('pdftotext', ['-layout', '-enc', 'UTF-8', path, '-'], { timeout: 30_000, maxBuffer: MAX_UPLOAD });
      if (stdout.trim().length < 10) throw new BadRequestException('PDF has no readable text; OCR is not supported yet.');
      return { content: stdout, format: 'text' };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new ServiceUnavailableException('PDF support requires Poppler (pdftotext); it is included in the API Docker image.');
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException('PDF could not be read within the size/time limit.');
    } finally { await rm(dir, { recursive: true, force: true }); }
  }
  if (!['.html', '.htm', '.txt'].includes(ext)) throw new BadRequestException('Supported files: HTML, TXT, text-based PDF.');
  let content: string;
  try { content = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { throw new BadRequestException('Text and HTML must use UTF-8 encoding.'); }
  if (content.includes('\0')) throw new BadRequestException('Binary content is not accepted as text.');
  return { content, format: ext === '.txt' ? 'text' : 'html' };
}
