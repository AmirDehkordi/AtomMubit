import { BadRequestException, Body, Controller, Logger, Param, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import type { StreamEvent } from '@desk/shared';
import { AgentService } from './agent.service';

@Controller('chat')
export class AgentController {
  private readonly logger = new Logger(AgentController.name);

  constructor(private readonly agent: AgentService) {}

  /** One user message. The response is a server-sent event stream of StreamEvents. */
  @Post(':conversationId/messages')
  async send(
    @Param('conversationId') conversationId: string,
    @Body() body: { text?: string } | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const text = body?.text?.trim();
    if (!text) throw new BadRequestException('text is required');

    res.status(200).set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();
    const emit = (event: StreamEvent) => res.write(`data: ${JSON.stringify(event)}\n\n`);
    try {
      await this.agent.chat(conversationId, text, emit);
    } catch (err) {
      this.logger.error(err instanceof Error ? err.stack : String(err));
      emit({ type: 'error', message: err instanceof Error ? err.message : String(err) });
    } finally {
      res.end();
    }
  }
}
