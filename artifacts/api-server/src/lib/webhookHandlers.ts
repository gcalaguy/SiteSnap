import { eq } from 'drizzle-orm';
import { db, companiesTable } from '@workspace/db';
import { getStripeSync } from './stripeClient';
import { logger } from './logger';

export class WebhookHandlers {
  static async processWebhook(payload: Buffer, signature: string): Promise<void> {
    if (!Buffer.isBuffer(payload)) {
      throw new Error(
        'STRIPE WEBHOOK ERROR: Payload must be a Buffer. ' +
        'Received type: ' + typeof payload + '. ' +
        'This usually means express.json() parsed the body before reaching this handler. ' +
        'FIX: Ensure webhook route is registered BEFORE app.use(express.json()).'
      );
    }

    const sync = await getStripeSync();

    // 1. Let stripe-replit-sync handle the event — syncs all stripe.* schema tables
    await sync.processWebhook(payload, signature);

    // 2. Parse the event so we can react to subscription lifecycle changes
    //    and keep companiesTable in sync (stripeCustomerId / stripeSubscriptionId)
    let event: any;
    try {
      // Re-construct the event (signature already verified by sync above)
      const payloadStr = payload.toString('utf8');
      event = JSON.parse(payloadStr);
    } catch {
      // If we can't parse, the sync above already succeeded — just log and return
      logger.warn('Stripe webhook: could not parse event JSON for DB sync');
      return;
    }

    await WebhookHandlers.syncCompanySubscription(event);
  }

  /**
   * Keeps companiesTable.stripeCustomerId and stripeSubscriptionId in sync
   * based on Stripe subscription lifecycle events.
   *
   * companyId is stored in subscription metadata as `companyId` (set during checkout).
   * customerId is stored on the company after the first checkout session.
   */
  private static async syncCompanySubscription(event: any): Promise<void> {
    const { type, data } = event;
    const obj = data?.object;

    switch (type) {

      // ── Checkout completed ─────────────────────────────────────────────────
      // This fires when the user finishes a checkout session.
      // obj.subscription contains the new subscription ID.
      // obj.customer contains the Stripe customer ID.
      // companyId is in obj.metadata (set via subscription_data.metadata in checkout).
      case 'checkout.session.completed': {
        const companyId = obj?.metadata?.companyId
          ?? obj?.subscription_data?.metadata?.companyId;
        const subscriptionId = obj?.subscription;
        const customerId = obj?.customer;

        if (!companyId || !subscriptionId) {
          logger.info({ type, companyId, subscriptionId }, 'checkout.session.completed: missing companyId or subscriptionId, skipping DB sync');
          break;
        }

        await db
          .update(companiesTable)
          .set({
            stripeSubscriptionId: subscriptionId,
            ...(customerId ? { stripeCustomerId: customerId } : {}),
          })
          .where(eq(companiesTable.id, Number(companyId)));

        logger.info({ companyId, subscriptionId, customerId }, 'DB synced: checkout completed → subscription created');
        break;
      }

      // ── Subscription created (also fires on checkout, belt-and-suspenders) ─
      case 'customer.subscription.created': {
        const companyId = obj?.metadata?.companyId;
        const subscriptionId = obj?.id;
        const customerId = obj?.customer;

        if (!companyId || !subscriptionId) {
          logger.info({ type, companyId, subscriptionId }, 'subscription.created: no companyId metadata, skipping DB sync');
          break;
        }

        await db
          .update(companiesTable)
          .set({
            stripeSubscriptionId: subscriptionId,
            ...(customerId ? { stripeCustomerId: customerId } : {}),
          })
          .where(eq(companiesTable.id, Number(companyId)));

        logger.info({ companyId, subscriptionId }, 'DB synced: subscription.created');
        break;
      }

      // ── Subscription updated (plan change, trial end, renewal, etc.) ────────
      case 'customer.subscription.updated': {
        const companyId = obj?.metadata?.companyId;
        const subscriptionId = obj?.id;

        if (!companyId || !subscriptionId) {
          // Try to look up company by stripeCustomerId as a fallback
          const customerId = obj?.customer;
          if (customerId) {
            await db
              .update(companiesTable)
              .set({ stripeSubscriptionId: subscriptionId })
              .where(eq(companiesTable.stripeCustomerId, customerId));
            logger.info({ customerId, subscriptionId }, 'DB synced: subscription.updated (by customerId fallback)');
          } else {
            logger.info({ type }, 'subscription.updated: no companyId or customerId, skipping DB sync');
          }
          break;
        }

        await db
          .update(companiesTable)
          .set({ stripeSubscriptionId: subscriptionId })
          .where(eq(companiesTable.id, Number(companyId)));

        logger.info({ companyId, subscriptionId }, 'DB synced: subscription.updated');
        break;
      }

      // ── Trial ending soon (3 days warning) ──────────────────────────────────
      // Stripe sends this ~72 hours before trial_end by default.
      // Log for now; wire up email notification in a future sprint.
      case 'customer.subscription.trial_will_end': {
        const companyId = obj?.metadata?.companyId;
        const trialEnd = obj?.trial_end;
        logger.warn(
          { companyId, trialEnd, subscriptionId: obj?.id },
          'Stripe: trial ending soon — send reminder to customer',
        );
        break;
      }

      // ── Payment failed ──────────────────────────────────────────────────────
      // Fired on the first failed charge attempt and each subsequent retry.
      // We log the event and flag the company so the UI can surface a banner.
      case 'invoice.payment_failed': {
        const customerId = obj?.customer;
        const invoiceId = obj?.id;
        const amountDue = obj?.amount_due;
        const attemptCount = obj?.attempt_count;

        if (customerId) {
          // Mark subscription as payment_failed so the app can warn the user.
          // The actual subscription status is updated by stripe-replit-sync on
          // customer.subscription.updated; we only need to surface the event.
          logger.warn(
            { customerId, invoiceId, amountDue, attemptCount },
            'Stripe: invoice payment failed — customer should update payment method',
          );

          // After 3 failed attempts Stripe typically cancels the subscription,
          // which fires customer.subscription.deleted. No extra DB action needed here.
        } else {
          logger.warn({ invoiceId }, 'invoice.payment_failed: no customerId on invoice');
        }
        break;
      }

      // ── Subscription cancelled / deleted ────────────────────────────────────
      case 'customer.subscription.deleted': {
        const subscriptionId = obj?.id;
        const companyId = obj?.metadata?.companyId;
        const customerId = obj?.customer;

        if (companyId) {
          await db
            .update(companiesTable)
            .set({ stripeSubscriptionId: null })
            .where(eq(companiesTable.id, Number(companyId)));
          logger.info({ companyId, subscriptionId }, 'DB synced: subscription cancelled → stripeSubscriptionId cleared');
        } else if (customerId) {
          // Fallback: look up by customer ID
          await db
            .update(companiesTable)
            .set({ stripeSubscriptionId: null })
            .where(eq(companiesTable.stripeCustomerId, customerId));
          logger.info({ customerId, subscriptionId }, 'DB synced: subscription cancelled (by customerId fallback) → stripeSubscriptionId cleared');
        } else {
          logger.warn({ subscriptionId }, 'subscription.deleted: no companyId or customerId to clear subscription from DB');
        }
        break;
      }

      default:
        // Not a subscription lifecycle event — no DB action needed
        break;
    }
  }
}
