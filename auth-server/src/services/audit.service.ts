import { db } from '../db';
import { activityLog } from '../db/schema';

export interface AuditEvent {
  userId?: string;
  action: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
}

export const recordAudit = async (event: AuditEvent): Promise<void> => {
  await db.insert(activityLog).values({
    userId: event.userId,
    action: event.action,
    entityType: event.entityType,
    entityId: event.entityId,
    metadata: event.metadata,
  });
};
