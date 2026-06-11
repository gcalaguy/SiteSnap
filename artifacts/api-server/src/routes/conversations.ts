import { Router } from "express";
import {
  db,
  conversations as conversationsTable,
  messages as messagesTable,
} from "@workspace/db";
import { eq, desc, and, asc } from "drizzle-orm";
import { requireAuth, requireCompany } from "../lib/auth";
import { asyncHandler } from "../lib/asyncHandler";
import { requirePermission } from "../lib/permissionGate";
import { openai } from "@workspace/integrations-openai-ai-server";
import { notify } from "../lib/notify";
import { buildTenantContext } from "../lib/buildTenantContext";
import { searchWeb, formatSearchContext, webSearchEnabled } from "../lib/webSearch.js";
import { canSearchWeb, recordWebSearch } from "../lib/webSearchRateLimiter.js";
import { z } from "zod";

const NewConversationBody = z.object({ message: z.string().min(1).max(10000) });
const NewMessageBody = z.object({ content: z.string().min(1).max(10000) });

const router = Router();

// ── System prompt ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are Site Snap AI, a knowledgeable construction assistant for Canadian field crews and project managers.

You have direct access to this company's live data — projects, daily reports, tasks, RFIs, quotes, invoices, contacts, leads, timesheets, and safety forms. This data is provided in the context section below with every message.

When answering questions:
- Reference actual data from the context. Quote names, dates, and amounts precisely.
- If the user asks about something that is not in the context, say "I don't see that in your records" rather than guessing or making up data.
- For general construction knowledge (Canadian building codes, NBC, safety guidelines, estimating rules of thumb), answer from your training knowledge.
- Keep responses concise and practical. Use plain language suited for field workers and project managers.
- When listing items, use bullet points or numbered lists for clarity.

You help with:
- Searching and summarizing project data, reports, tasks, RFIs, quotes, and invoices
- Canadian building codes (NBC, provincial codes)
- Safety best practices and guidelines
- Daily report writing tips and field notes
- Cost estimation, crew scheduling, and site management advice
- Any general construction question a foreman or project manager might ask`;

// ── AI reply ──────────────────────────────────────────────────────────────────

/**
 * Decide if a user message warrants a web search.
 * Short replies ("ok", "yes", "thanks") and single-word commands skip it.
 */
function shouldSearchWeb(lastUserMessage: string): boolean {
  const trimmed = lastUserMessage.trim();
  if (trimmed.length < 10) return false;
  const skipWords = new Set(["ok", "yes", "no", "thanks", "thank you", "got it", "sure", "nope", "hello", "hi", "bye", "goodbye"]);
  const lower = trimmed.toLowerCase().replace(/[^a-z ]/g, "");
  if (skipWords.has(lower)) return false;
  return true;
}

async function getAIReply(
  messageHistory: { role: "user" | "assistant"; content: string }[],
  tenantContext: string,
  companyId?: number,
): Promise<string> {
  const today = new Date().toLocaleDateString("en-CA");

  let webSearchContext = "";
  let quotaNote = "";

  if (companyId && webSearchEnabled() && canSearchWeb(companyId)) {
    const lastUser = [...messageHistory].reverse().find(m => m.role === "user");
    if (lastUser && shouldSearchWeb(lastUser.content)) {
      const results = await searchWeb(lastUser.content);
      if (results.length > 0) {
        recordWebSearch(companyId);
        webSearchContext = formatSearchContext(results);
      }
    }
  } else if (companyId && webSearchEnabled() && !canSearchWeb(companyId)) {
    quotaNote = "\n\nNOTE: The user's company has reached its daily web search quota. Only use internal project data and your training knowledge.";
  }

  const systemPrompt =
    SYSTEM_PROMPT +
    `\n\nToday's date: ${today}\n\n${tenantContext}${webSearchContext}${quotaNote}`;

  const response = await openai.chat.completions.create({
    model: "gpt-5.4",
    max_completion_tokens: 1024,
    messages: [{ role: "system", content: systemPrompt }, ...messageHistory],
  });

  return (
    response.choices[0]?.message?.content ??
    "Sorry, I couldn't generate a response. Please try again."
  );
}

function generateTitle(firstMessage: string): string {
  const words = firstMessage.trim().split(/\s+/);
  const title = words.slice(0, 7).join(" ");
  return title.length > 60 ? title.slice(0, 60) + "…" : title;
}

// ── Routes ────────────────────────────────────────────────────────────────────

// GET /conversations
router.get("/conversations", requireAuth, requireCompany, requirePermission("viewClientMessages"), asyncHandler(async (req, res) => {
  try {
    const convos = await db
      .select()
      .from(conversationsTable)
      .where(
        and(
          eq(conversationsTable.userId, req.userId!),
          eq(conversationsTable.companyId, req.companyId!),
        ),
      )
      .orderBy(desc(conversationsTable.updatedAt));
    res.json(convos);
  } catch (err) {
    req.log?.error({ err }, "Failed to list conversations");
    res.status(500).json({ error: "Failed to list conversations" });
  }
}))

// POST /conversations — create conversation + first message
router.post("/conversations", requireAuth, requireCompany, requirePermission("viewClientMessages"), asyncHandler(async (req, res) => {
  const convParsed = NewConversationBody.safeParse(req.body);
  if (!convParsed.success) { res.status(400).json({ error: convParsed.error.flatten() }); return; }
  const { message } = convParsed.data;

  try {
    const tenantContext = await buildTenantContext(req.companyId!, req.userId!, req.userRole);

    const [conversation] = await db
      .insert(conversationsTable)
      .values({
        userId: req.userId!,
        companyId: req.companyId!,
        title: generateTitle(message),
      })
      .returning();

    const [userMessage] = await db
      .insert(messagesTable)
      .values({ conversationId: conversation.id, role: "user", content: message.trim() })
      .returning();

    const reply = await getAIReply(
      [{ role: "user", content: message.trim() }],
      tenantContext,
      req.companyId!,
    );

    const [aiMessage] = await db
      .insert(messagesTable)
      .values({ conversationId: conversation.id, role: "assistant", content: reply })
      .returning();

    // Notify the user that the AI has replied
    notify({
      userId: req.userId!,
      type: "message",
      title: "Site Snap AI replied",
      body: reply.length > 120 ? reply.slice(0, 120) + "…" : reply,
      referenceId: conversation.id,
    }).catch(() => {});

    res.status(201).json({ conversation, messages: [userMessage, aiMessage], reply });
  } catch (err) {
    req.log?.error({ err }, "Failed to create conversation");
    res.status(500).json({ error: "Failed to create conversation" });
  }
}))

// GET /conversations/:conversationId
router.get("/conversations/:conversationId", requireAuth, requireCompany, requirePermission("viewClientMessages"), asyncHandler(async (req, res) => {
  const id = parseInt(req.params.conversationId as string, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid conversation ID" });
    return;
  }

  try {
    // P0: include companyId so users cannot read conversations from other tenants
    const [conversation] = await db
      .select()
      .from(conversationsTable)
      .where(and(
        eq(conversationsTable.id, id),
        eq(conversationsTable.userId, req.userId!),
        eq(conversationsTable.companyId, req.companyId!),
      ))
      .limit(1);

    if (!conversation) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }

    const msgs = await db
      .select()
      .from(messagesTable)
      .where(eq(messagesTable.conversationId, id))
      .orderBy(asc(messagesTable.createdAt));

    res.json({ ...conversation, messages: msgs });
  } catch (err) {
    req.log?.error({ err }, "Failed to get conversation");
    res.status(500).json({ error: "Failed to get conversation" });
  }
}))

// POST /conversations/:conversationId/messages
router.post(
  "/conversations/:conversationId/messages",
  requireAuth,
  requireCompany,
  requirePermission("viewClientMessages"),
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.conversationId as string, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid conversation ID" });
      return;
    }

    const msgParsed = NewMessageBody.safeParse(req.body);
    if (!msgParsed.success) { res.status(400).json({ error: msgParsed.error.flatten() }); return; }
    const { content } = msgParsed.data;

    try {
      // P0: include companyId so users cannot post to conversations from other tenants
      const [conversation] = await db
        .select()
        .from(conversationsTable)
        .where(and(
          eq(conversationsTable.id, id),
          eq(conversationsTable.userId, req.userId!),
          eq(conversationsTable.companyId, req.companyId!),
        ))
        .limit(1);

      if (!conversation) {
        res.status(404).json({ error: "Conversation not found" });
        return;
      }

      // Fetch tenant context and conversation history in parallel
      const [tenantContext, history] = await Promise.all([
        buildTenantContext(req.companyId!, req.userId!, req.userRole),
        db
          .select()
          .from(messagesTable)
          .where(eq(messagesTable.conversationId, id))
          .orderBy(asc(messagesTable.createdAt)),
      ]);

      const [userMessage] = await db
        .insert(messagesTable)
        .values({ conversationId: id, role: "user", content: content.trim() })
        .returning();

      const messageHistory = [
        ...history.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
        { role: "user" as const, content: content.trim() },
      ];

      const reply = await getAIReply(messageHistory, tenantContext, req.companyId!);

      const [aiMessage] = await db
        .insert(messagesTable)
        .values({ conversationId: id, role: "assistant", content: reply })
        .returning();

      await db
        .update(conversationsTable)
        .set({ updatedAt: new Date() })
        .where(eq(conversationsTable.id, id));

      // Notify the user that the AI has replied
      notify({
        userId: req.userId!,
        type: "message",
        title: "Site Snap AI replied",
        body: reply.length > 120 ? reply.slice(0, 120) + "…" : reply,
        referenceId: id,
      }).catch(() => {});

      res.json({ message: userMessage, reply, aiMessage });
    } catch (err) {
      req.log?.error({ err }, "Failed to add message");
      res.status(500).json({ error: "Failed to add message" });
    }
  }),
);

// DELETE /conversations/:conversationId
router.delete("/conversations/:conversationId", requireAuth, requireCompany, requirePermission("viewClientMessages"), asyncHandler(async (req, res) => {
  const id = parseInt(req.params.conversationId as string, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid conversation ID" });
    return;
  }

  try {
    const [conversation] = await db
      .select()
      .from(conversationsTable)
      .where(and(eq(conversationsTable.id, id), eq(conversationsTable.userId, req.userId!), eq(conversationsTable.companyId, req.companyId!)))
      .limit(1);

    if (!conversation) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }

    await db.delete(conversationsTable).where(and(eq(conversationsTable.id, id), eq(conversationsTable.userId, req.userId!), eq(conversationsTable.companyId, req.companyId!)));
    res.status(204).send();
  } catch (err) {
    req.log?.error({ err }, "Failed to delete conversation");
    res.status(500).json({ error: "Failed to delete conversation" });
  }
}))

export default router;
