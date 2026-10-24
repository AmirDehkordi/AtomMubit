import { BadRequestException, Body, Controller, Get, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import { CorrectionsService } from './corrections.service';
import { RulesService } from './rules.service';

const CorrectionBody = z.object({
  blockId: z.string().min(1),
  projectId: z.string().nullable().default(null),
  note: z.string().min(1).max(500),
  ruleCode: z.string().regex(/^R\d+$/).nullable().default(null),
  ruleText: z.string().max(500).nullable().default(null),
});

@Controller()
export class RulesController {
  constructor(
    private readonly rules: RulesService,
    private readonly corrections: CorrectionsService,
  ) {}

  @Get('rules')
  list() {
    return this.rules.all();
  }

  /** Flag a block: proposes a rule and lists the sections it would re-read. Nothing changes yet. */
  @Post('corrections')
  propose(@Body() body: unknown) {
    const parsed = CorrectionBody.safeParse(body);
    if (!parsed.success) throw new BadRequestException(z.prettifyError(parsed.error));
    return this.corrections.propose(parsed.data);
  }

  /** Confirm: the rule becomes active and the sections are re-read with it. */
  @Post('corrections/:id/apply')
  apply(@Param('id') id: string) {
    return this.corrections.apply(id);
  }

  @Post('corrections/:id/dismiss')
  async dismiss(@Param('id') id: string) {
    await this.corrections.dismiss(id);
    return { ok: true };
  }
}
