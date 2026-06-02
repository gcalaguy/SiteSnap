import { Router } from 'express';
import { db } from '@workspace/db';
import { and, eq } from 'drizzle-orm';
import { 
  companiesTable, 
  usersTable, 
  quotesTable, 
  dailyReportsTable, 
  tasksTable 
} from '@workspace/db/schema';

const router = Router();

/**
 * SEC-003: Secure Member Removal Endpoint
 * Ensures isolated cascade deletes strictly restricted to the host company context.
 */
router.delete('/:companyId/members/:userId', async (req, res) => {
  try {
    const { companyId, userId } = req.params;

    if (!companyId || !userId) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    // Wrap the operations in a safe cross-table transaction block
    await db.transaction(async (tx) => {
      // 1. Remove company scope items first using the compound multi-tenant filter
      await tx.delete(quotesTable).where(
        and(
          eq(quotesTable.userId, userId),
          eq(quotesTable.companyId, companyId)
        )
      );

      await tx.delete(dailyReportsTable).where(
        and(
          eq(dailyReportsTable.userId, userId),
          eq(dailyReportsTable.companyId, companyId)
        )
      );

      await tx.delete(tasksTable).where(
        and(
          eq(tasksTable.userId, userId),
          eq(tasksTable.companyId, companyId)
        )
      );

      // 2. Break the link between this specific company and user mapping table
      // (Modify this mapping statement to align with your project's exact member table if different)
      await tx.delete(usersTable).where(
        and(
          eq(usersTable.id, userId),
          eq(usersTable.companyId, companyId)
        )
      );
    });

    return res.status(200).json({ message: 'Member successfully removed from company scope.' });
  } catch (error) {
    console.error('Failed to execute member removal cascade securely:', error);
    return res.status(500).json({ error: 'Internal server error occurred during isolation routine.' });
  }
});

export default router;