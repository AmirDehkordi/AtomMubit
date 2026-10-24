import { Injectable } from '@nestjs/common';
import { Subject, filter, type Observable } from 'rxjs';
import type { StreamEvent } from '@desk/shared';

interface Envelope {
  projectId: string;
  event: StreamEvent;
}

/** Background events (extraction progress, block status), fanned out per project over SSE. */
@Injectable()
export class EventsService {
  private readonly bus = new Subject<Envelope>();

  emit(projectId: string, event: StreamEvent): void {
    this.bus.next({ projectId, event });
  }

  forProject(projectId: string): Observable<Envelope> {
    return this.bus.pipe(filter((e) => e.projectId === projectId));
  }
}
