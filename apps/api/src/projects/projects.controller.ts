import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ProjectsService } from './projects.service';

@Controller()
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  /** Starts a desk. The first question is then sent to /chat/:conversationId/messages. */
  @Post('conversations')
  create(@Body() body: { replay?: boolean } | undefined) {
    return this.projects.create(Boolean(body?.replay));
  }

  @Get('projects/:id')
  get(@Param('id') id: string) {
    return this.projects.get(id);
  }
}
