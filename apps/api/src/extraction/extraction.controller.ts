import { BadRequestException, Body, Controller, Get, Headers, HttpCode, Post, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { z } from 'zod';
import { ExtractionService } from './extraction.service';
import { MAX_UPLOAD } from './upload';
const Id = z.string().min(1).max(128);
const Request = z.strictObject({projectId: Id, request: z.string().trim().min(1).max(10000), parentRequestId: Id.optional(), documentIds: z.array(Id).max(10).optional(), idempotencyKey: Id.optional()});
const Feedback = z.strictObject({projectId: Id, runId: Id, text: z.string().trim().min(1).max(10000), idempotencyKey: Id.optional()});
const DataQuery = z.object({projectId: Id, requestId: Id.optional(), runId: Id.optional(), documentId: Id.optional(), feedbackId: Id.optional(), ticker: z.string().max(12).optional(), periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), after: z.coerce.number().int().nonnegative().optional()});
function parse<T>(schema: z.ZodType<T>, input: unknown): T { const result = schema.safeParse(input); if (!result.success) throw new BadRequestException(result.error.flatten()); return result.data; }
@Controller('v1')
export class ExtractionController {
  constructor(private readonly extraction: ExtractionService) {}
  @Get('data') data(@Query() query: unknown) { return this.extraction.data(parse(DataQuery, query)); }
  @Post('extractions') @HttpCode(202)
  request(@Body() body: unknown, @Headers('idempotency-key') key?: string) {
    const {idempotencyKey, ...input} = parse(Request, body);
    return this.extraction.submitRequest(input, key ? parse(Id, key) : idempotencyKey);
  }
  @Post('feedback') @HttpCode(202)
  feedback(@Body() body: unknown, @Headers('idempotency-key') key?: string) {
    const {idempotencyKey, ...input} = parse(Feedback, body);
    return this.extraction.submitFeedback(input, key ? parse(Id, key) : idempotencyKey);
  }
  @Post('files') @UseInterceptors(FileInterceptor('file', {limits: {fileSize: MAX_UPLOAD, files: 1, fields: 3}}))
  upload(@UploadedFile() file: {originalname: string; buffer: Buffer} | undefined, @Body() body: unknown, @Headers('idempotency-key') key?: string) {
    const input = parse(z.strictObject({projectId: Id, ticker: z.string().regex(/^[A-Za-z0-9.-]{1,12}$/).optional(), idempotencyKey: Id.optional()}), body);
    if (!file) throw new BadRequestException('file is required');
    const name = file.originalname.split(/[\\/]/).at(-1)!.slice(0, 200);
    return this.extraction.upload(input.projectId, name, file.buffer, input.ticker?.toUpperCase(), key ? parse(Id, key) : input.idempotencyKey);
  }
}
