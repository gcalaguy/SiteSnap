import { Router } from "express";
import { db, conversations as conversationsTable, messages as messagesTable } from "@workspace/db";
import { eq, desc, and, asc } from "drizzle-orm";
import { requireAuth, requireCompany } from "../lib/auth";
import { openai } from "@workspace/integrations-openai-ai-server";

const router = Router();

const SYSTEM_PROMPT = `You are Site Snap AI, a friendly and knowledgeable construction assistant for Canadian field crews and project managers.

You help with:
- Project status and progress questions
- Daily report writing tips and safety guidelines
- Canadian building codes (NBC, provincial codes)
- Material estimating, crew scheduling, and site management
- Weather delays, RFI guidance, and subcontractor coordination
- Any general construction question a foreman or site supervisor might ask

Keep responses concise and practical. Use plain language suited for field workers. If specific project data is provided in the context, reference it in your answers.`;

async function getAIReply(
  messageHistory: { role: "user" | "assistant"; content: string }[],
  context?: string | null,
): Promise<string> {
  const today = new Date().toLocaleDateString("en-CA");
  const systemPrompt =
    SYSTEM_PROMPT +
    `\n\nToday's date: ${today}` +
    (context ? `\n\n--- Company & Project Context ---\n${context}\n---` : "");

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

// ── List conversations ────────────────────────────────────────────────────────
router.get("/conversations", requireAuth, requireCompany, async (req, res) => {
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
});

// ── Create conversation + first message ──────────────────────────────────────
router.post("/conversations", requireAuth, requireCompany, async (req, res) => {
  const { message, context } = req.body as { message?: string; context?: string };

  if (!message || typeof message !== "string" || !message.trim()) {
    res.status(400).json({ error: "message is required" });
    return;
  }

  try {
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

    const reply = await getAIReply([{ role: "user", content: message.trim() }], context);

    const [aiMessage] = await db
      .insert(messagesTable)
      .values({ conversationId: conversation.id, role: "assistant", content: reply })
      .returning();

    res.status(201).json({ conversation, messages: [userMessage, aiMessage], reply });
  } catch (err) {
    req.log?.error({ err }, "Failed to create conversation");
    res.status(500).json({ error: "Failed to create conversation" });
  }
});

// ── Get conversation with messages ───────────────────────────────────────────
router.get("/conversations/:conversationId", requireAuth, requireCompany, async (req, res) => {
  const id = parseInt(req.params.conversationId, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid conversation ID" });
    return;
  }

  try {
    const [conversation] = await db
      .select()
      .from(conversationsTable)
      .where(and(eq(conversationsTable.id, id), eq(conversationsTable.userId, req.userId!)))
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
});

// ── Add message to conversation ───────────────────────────────────────────────
router.post(
  "/conversations/:conversationId/messages",
  requireAuth,
  requireCompany,
  async (req, res) => {
    const id = parseInt(req.params.conversationId, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid conversation ID" });
      return;
    }

    const { content, context } = req.body as { content?: string; context?: string };
    if (!content || typeof content !== "string" || !content.trim()) {
      res.status(400).json({ error: "content is required" });
      return;
    }

    try {
      const [conversation] = await db
        .select()
        .from(conversationsTable)
        .where(and(eq(conversationsTable.id, id), eq(conversationsTable.userId, req.userId!)))
        .limit(1);

      if (!conversation) {
        res.status(404).json({ error: "Conversation not found" });
        return;
      }

      const history = await db
        .select()
        .from(messagesTable)
        .where(eq(messagesTable.conversationId, id))
        .orderBy(asc(messagesTable.createdAt));

      const [userMessage] = await db
        .insert(messagesTable)
        .values({ conversationId: id, role: "user", content: content.trim() })
        .returning();

      const messageHistory = [
        ...history.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
        { role: "user" as const, content: content.trim() },
      ];

      const reply = await getAIReply(messageHistory, context);

      const [aiMessage] = await db
        .insert(messagesTable)
        .values({ conversationId: id, role: "assistant", content: reply })
        .returning();

      await db
        .update(conversationsTable)
        .set({ updatedAt: new Date() })
        .where(eq(conversationsTable.id, id));

      res.json({ message: userMessage, reply, aiMessage });
    } catch (err) {
      req.log?.error({ err }, "Failed to add message");
      res.status(500).json({ error: "Failed to add message" });
    }
  },
);

// ── Delete conversation ────────────────────────────────────────────────────────
router.delete("/conversations/:conversationId", requireAuth, requireCompany, async (req, res) => {
  const id = parseInt(req.params.conversationId, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid conversation ID" });
    return;
  }

  try {
    const [conversation] = await db
      .select()
      .from(conversationsTable)
      .where(and(eq(conversationsTable.id, id), eq(conversationsTable.userId, req.userId!)))
      .limit(1);

    if (!conversation) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }

    await db.delete(conversationsTable).where(eq(conversationsTable.id, id));
    res.status(204).send();
  } catch (err) {
    req.log?.error({ err }, "Failed to delete conversation");
    res.status(500).json({ error: "Failed to delete conversation" });
  }
});

export default router;
