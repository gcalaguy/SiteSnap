import {
  db,
  emailFilingRulesTable,
  type EmailMessage,
  type FilingRuleAction,
  type FilingRuleCondition,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";

/**
 * Admin-defined automatic filing rules — evaluated before the statistical
 * matching engine (projectMatchingService.ts) during sync. Rules are
 * evaluated in priority order (lowest first); the first rule whose
 * conditions fully match wins outright, mirroring a typical mail-client
 * filter engine rather than combining multiple rules' actions.
 */

function fieldValue(field: FilingRuleCondition["field"], message: EmailMessage): string {
  switch (field) {
    case "subject":
      return message.subject ?? "";
    case "from_email":
      return message.fromEmail ?? "";
    case "from_name":
      return message.fromName ?? "";
    case "to_emails":
      return (message.toEmails ?? []).join(", ");
    case "cc_emails":
      return (message.ccEmails ?? []).join(", ");
    case "body_text":
      return message.bodyText ?? "";
    default:
      return "";
  }
}

function matchesCondition(condition: FilingRuleCondition, message: EmailMessage): boolean {
  const actual = fieldValue(condition.field, message).toLowerCase();
  const expected = condition.value.trim().toLowerCase();
  if (!expected) return false;
  switch (condition.operator) {
    case "contains":
      return actual.includes(expected);
    case "equals":
      return actual === expected;
    case "starts_with":
      return actual.startsWith(expected);
    default:
      return false;
  }
}

/** Returns the winning rule's actions, or [] if no enabled rule fully matches. */
export async function evaluateRules(companyId: number, message: EmailMessage): Promise<FilingRuleAction[]> {
  const rules = await db
    .select()
    .from(emailFilingRulesTable)
    .where(and(eq(emailFilingRulesTable.companyId, companyId), eq(emailFilingRulesTable.isEnabled, true)))
    .orderBy(emailFilingRulesTable.priority);

  for (const rule of rules) {
    if (rule.conditions.length === 0) continue;
    const results = rule.conditions.map((c) => matchesCondition(c, message));
    const matched = rule.conditionLogic === "AND" ? results.every(Boolean) : results.some(Boolean);
    if (matched) return rule.actions;
  }
  return [];
}
