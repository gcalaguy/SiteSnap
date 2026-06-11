import { describe, it, expect, vi } from "vitest";
import * as apiClient from "@workspace/api-client-react";
import { interpretVoiceCommand, withActiveProject } from "./voiceRouter";

vi.mock("@workspace/api-client-react", () => ({
  customFetch: vi.fn().mockResolvedValue({ intent: "UNKNOWN" }),
  ApiError: class extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
}));

const mockCustomFetch = () => vi.mocked(apiClient.customFetch);

describe("interpretVoiceCommand", () => {
  it("returns UNKNOWN for empty string", async () => {
    const result = await interpretVoiceCommand("");
    expect(result.intent).toBe("UNKNOWN");
    expect(result.confidence).toBe("low");
  });

  it("returns UNKNOWN for whitespace-only input", async () => {
    const result = await interpretVoiceCommand("   ");
    expect(result.intent).toBe("UNKNOWN");
    expect(result.confidence).toBe("low");
  });

  it("returns DATA_ENTRY for unrecognized phrase (falls through to LLM fallback as dictation)", async () => {
    const result = await interpretVoiceCommand("tell the crew to finish the drywall by Friday");
    expect(result.intent).toBe("DATA_ENTRY");
    if (result.intent === "DATA_ENTRY") {
      expect(result.action).toBe("ADD_NOTE");
      expect(result.payload).toBe("tell the crew to finish the drywall by Friday");
      expect(result.confidence).toBe("low");
    }
  });

  it("navigates to Calculators (lowercase)", async () => {
    const result = await interpretVoiceCommand("open the calculator");
    expect(result.intent).toBe("NAVIGATE");
    if (result.intent === "NAVIGATE") {
      expect(result.target).toBe("Calculators");
      expect(result.confidence).toBe("high");
    }
  });

  it("navigates to Calculators (mixed case)", async () => {
    const result = await interpretVoiceCommand("Open The Calculator");
    expect(result.intent).toBe("NAVIGATE");
    if (result.intent === "NAVIGATE") {
      expect(result.target).toBe("Calculators");
    }
  });

  it("navigates to Schedule", async () => {
    const result = await interpretVoiceCommand("show me the schedule");
    expect(result.intent).toBe("NAVIGATE");
    if (result.intent === "NAVIGATE") {
      expect(result.target).toBe("Schedule");
    }
  });

  it("navigates to Schedule via calendar keyword", async () => {
    const result = await interpretVoiceCommand("go to calendar");
    expect(result.intent).toBe("NAVIGATE");
    if (result.intent === "NAVIGATE") {
      expect(result.target).toBe("Schedule");
    }
  });

  it("navigates to Projects", async () => {
    const result = await interpretVoiceCommand("take me to projects");
    expect(result.intent).toBe("NAVIGATE");
    if (result.intent === "NAVIGATE") {
      expect(result.target).toBe("Projects");
    }
  });

  it("navigates to Ask via assistant keyword", async () => {
    const result = await interpretVoiceCommand("open the assistant");
    expect(result.intent).toBe("NAVIGATE");
    if (result.intent === "NAVIGATE") {
      expect(result.target).toBe("Ask");
    }
  });

  it("navigates to Tasks", async () => {
    const result = await interpretVoiceCommand("open my tasks");
    expect(result.intent).toBe("NAVIGATE");
    if (result.intent === "NAVIGATE") {
      expect(result.target).toBe("Tasks");
    }
  });

  it("navigates to Invoices", async () => {
    const result = await interpretVoiceCommand("go to invoices");
    expect(result.intent).toBe("NAVIGATE");
    if (result.intent === "NAVIGATE") {
      expect(result.target).toBe("Invoices");
    }
  });

  it("navigates to FieldLogs", async () => {
    const result = await interpretVoiceCommand("show today's reports");
    expect(result.intent).toBe("NAVIGATE");
    if (result.intent === "NAVIGATE") {
      expect(result.target).toBe("FieldLogs");
    }
  });

  it("returns DATA_ENTRY with sanitized payload for a note", async () => {
    const result = await interpretVoiceCommand("add a note concrete pour went well today");
    expect(result.intent).toBe("DATA_ENTRY");
    if (result.intent === "DATA_ENTRY") {
      expect(result.action).toBe("ADD_NOTE");
      expect(result.payload).toBe("concrete pour went well today");
      expect(result.confidence).toBe("high");
    }
  });

  it("returns DATA_ENTRY for 'create note' variant", async () => {
    const result = await interpretVoiceCommand("create note site inspection complete");
    expect(result.intent).toBe("DATA_ENTRY");
    if (result.intent === "DATA_ENTRY") {
      expect(result.payload).toBe("site inspection complete");
    }
  });

  it("returns DATA_ENTRY with low confidence when note has no content", async () => {
    const result = await interpretVoiceCommand("add a note");
    expect(result.intent).toBe("DATA_ENTRY");
    if (result.intent === "DATA_ENTRY") {
      expect(result.payload).toBe("");
      expect(result.confidence).toBe("low");
    }
  });

  it("caps DATA_ENTRY payload at 500 characters", async () => {
    const longText = "x".repeat(600);
    const result = await interpretVoiceCommand(`add a note ${longText}`);
    expect(result.intent).toBe("DATA_ENTRY");
    if (result.intent === "DATA_ENTRY") {
      expect(result.payload.length).toBe(500);
    }
  });

  it("DATA_ENTRY takes priority over NAVIGATE when both could match", async () => {
    const result = await interpretVoiceCommand("add a note check the project schedule");
    expect(result.intent).toBe("DATA_ENTRY");
  });

  /* ─── New command tests ──────────────────────────────────────────────────── */

  it("parses LOG_OWN_HOURS with project", async () => {
    const result = await interpretVoiceCommand("I worked 5 hours on Oak Street today");
    expect(result.intent).toBe("SINGLE_ACTION");
    if (result.intent === "SINGLE_ACTION" && result.action.type === "LOG_OWN_HOURS") {
      expect(result.action.hours).toBe(5);
      expect(result.action.project).toBe("Oak Street today");
    }
  });

  it("parses LOG_OWN_HOURS with 'for myself'", async () => {
    const result = await interpretVoiceCommand("log 3 hours for myself on Main Street");
    expect(result.intent).toBe("SINGLE_ACTION");
    if (result.intent === "SINGLE_ACTION" && result.action.type === "LOG_OWN_HOURS") {
      expect(result.action.hours).toBe(3);
      expect(result.action.project).toBe("Main Street");
    }
  });

  it("parses MARK_TASK_DONE", async () => {
    const result = await interpretVoiceCommand("mark the framing inspection as complete");
    expect(result.intent).toBe("SINGLE_ACTION");
    if (result.intent === "SINGLE_ACTION" && result.action.type === "MARK_TASK_DONE") {
      expect(result.action.taskName).toBe("framing inspection");
    }
  });

  it("parses MARK_TASK_DONE via 'complete'", async () => {
    const result = await interpretVoiceCommand("complete the drywall");
    expect(result.intent).toBe("SINGLE_ACTION");
    if (result.intent === "SINGLE_ACTION" && result.action.type === "MARK_TASK_DONE") {
      expect(result.action.taskName).toBe("drywall");
    }
  });

  it("parses LOG_DELAY with weather", async () => {
    const result = await interpretVoiceCommand("log a 2-hour weather delay on Oak Street");
    expect(result.intent).toBe("SINGLE_ACTION");
    if (result.intent === "SINGLE_ACTION" && result.action.type === "LOG_DELAY") {
      expect(result.action.hours).toBe(2);
      expect(result.action.reason).toBe("weather");
      expect(result.action.project).toBe("Oak Street");
    }
  });

  it("parses LOG_EXPENSE with vendor and project", async () => {
    const result = await interpretVoiceCommand("expense $250 for lumber at Home Depot on Oak Street");
    expect(result.intent).toBe("SINGLE_ACTION");
    if (result.intent === "SINGLE_ACTION" && result.action.type === "LOG_EXPENSE") {
      expect(result.action.amount).toBe(250);
      expect(result.action.description).toBe("lumber");
      expect(result.action.vendor).toBe("Home Depot");
      expect(result.action.project).toBe("Oak Street");
    }
  });

  it("parses CREATE_RFI with project", async () => {
    const result = await interpretVoiceCommand("create an RFI about the beam size on Oak Street");
    expect(result.intent).toBe("SINGLE_ACTION");
    if (result.intent === "SINGLE_ACTION" && result.action.type === "CREATE_RFI") {
      expect(result.action.subject).toBe("beam size");
      expect(result.action.project).toBe("Oak Street");
    }
  });

  /* ─── Daily log project extraction tests ────────────────────────────────── */

  it("parses ADD_DAILY_LOG via 'update [project]' with no notes", async () => {
    const result = await interpretVoiceCommand("update 123 Basement");
    expect(result.intent).toBe("SINGLE_ACTION");
    if (result.intent === "SINGLE_ACTION" && result.action.type === "ADD_DAILY_LOG") {
      expect(result.action.project).toBe("123 Basement");
      expect(result.action.notes).toBe("Update logged via voice");
      expect(result.action.transcript).toBe("update 123 Basement");
    }
  });

  it("parses ADD_DAILY_LOG via 'update the [project] project'", async () => {
    const result = await interpretVoiceCommand("update the Oak Street project");
    expect(result.intent).toBe("SINGLE_ACTION");
    if (result.intent === "SINGLE_ACTION" && result.action.type === "ADD_DAILY_LOG") {
      expect(result.action.project).toBe("Oak Street");
      expect(result.action.transcript).toBe("update the Oak Street project");
    }
  });

  it("parses ADD_DAILY_LOG via 'update [project] that [notes]'", async () => {
    const result = await interpretVoiceCommand("update 123 Basement that the concrete pour finished");
    expect(result.intent).toBe("SINGLE_ACTION");
    if (result.intent === "SINGLE_ACTION" && result.action.type === "ADD_DAILY_LOG") {
      expect(result.action.project).toBe("123 Basement");
      expect(result.action.notes).toBe("the concrete pour finished");
      expect(result.action.transcript).toBe("update 123 Basement that the concrete pour finished");
    }
  });

  it("parses ADD_DAILY_LOG via 'add notes to [project] that [notes]'", async () => {
    const result = await interpretVoiceCommand("add notes to 123 Basement that the concrete pour finished");
    expect(result.intent).toBe("SINGLE_ACTION");
    if (result.intent === "SINGLE_ACTION" && result.action.type === "ADD_DAILY_LOG") {
      expect(result.action.project).toBe("123 Basement");
      expect(result.action.notes).toBe("the concrete pour finished");
      expect(result.action.transcript).toBe("add notes to 123 Basement that the concrete pour finished");
    }
  });

  it("parses ADD_DAILY_LOG via 'log that [notes] on [project]' — captures project", async () => {
    const result = await interpretVoiceCommand("log that framing is done on 123 Basement");
    expect(result.intent).toBe("SINGLE_ACTION");
    if (result.intent === "SINGLE_ACTION" && result.action.type === "ADD_DAILY_LOG") {
      expect(result.action.project).toBe("123 Basement");
      expect(result.action.notes).toBe("framing is done");
      expect(result.action.transcript).toBe("log that framing is done on 123 Basement");
    }
  });

  it("parses ADD_DAILY_LOG via 'note that' with no project", async () => {
    const result = await interpretVoiceCommand("note that workers arrived late");
    expect(result.intent).toBe("SINGLE_ACTION");
    if (result.intent === "SINGLE_ACTION" && result.action.type === "ADD_DAILY_LOG") {
      expect(result.action.project).toBeNull();
      expect(result.action.notes).toBe("workers arrived late");
      expect(result.action.transcript).toBe("note that workers arrived late");
    }
  });

  it("parses ADD_DAILY_LOG via 'note that' with no project (legacy test)", async () => {
    const result = await interpretVoiceCommand("note that the sub-grade is wet");
    expect(result.intent).toBe("SINGLE_ACTION");
    if (result.intent === "SINGLE_ACTION" && result.action.type === "ADD_DAILY_LOG") {
      expect(result.action).toMatchObject({
        notes: "the sub-grade is wet",
        project: null,
        transcript: "note that the sub-grade is wet",
      });
    }
  });

  /* ─── Existing tests ─────────────────────────────────────────────────────── */

  it("parses MATERIAL_ALERT for 'short on'", async () => {
    const result = await interpretVoiceCommand("We are short on 2x4 studs");
    expect(result.intent).toBe("SINGLE_ACTION");
    if (result.intent === "SINGLE_ACTION" && result.action.type === "MATERIAL_ALERT") {
      expect(result.action).toMatchObject({
        item: "2x4 studs",
        project: null,
      });
    }
  });

  it("parses MATERIAL_ALERT for 'need' phrasing", async () => {
    const result = await interpretVoiceCommand("need more concrete");
    expect(result.intent).toBe("SINGLE_ACTION");
    if (result.intent === "SINGLE_ACTION" && result.action.type === "MATERIAL_ALERT") {
      expect(result.action.item).toBe("more concrete");
    }
  });

  it("parses TRIGGER_CAMERA with context", async () => {
    const result = await interpretVoiceCommand("Take a photo of the foundation crack");
    expect(result.intent).toBe("SINGLE_ACTION");
    if (result.intent === "SINGLE_ACTION" && result.action.type === "TRIGGER_CAMERA") {
      expect(result.action).toMatchObject({
        context: "the foundation crack",
      });
    }
  });

  it("parses TRIGGER_CAMERA without context", async () => {
    const result = await interpretVoiceCommand("Take a photo");
    expect(result.intent).toBe("SINGLE_ACTION");
    if (result.intent === "SINGLE_ACTION" && result.action.type === "TRIGGER_CAMERA") {
      expect(result.action.context).toBeNull();
    }
  });

  it("parses SAFETY_LOG with project", async () => {
    const result = await interpretVoiceCommand("Subcontractor missing PPE at 123 Basement");
    expect(result.intent).toBe("SINGLE_ACTION");
    if (result.intent === "SINGLE_ACTION" && result.action.type === "SAFETY_LOG") {
      expect(result.action).toMatchObject({
        project: "123 Basement",
        issue: "missing PPE",
      });
    }
  });

  it("parses SAFETY_LOG without project", async () => {
    const result = await interpretVoiceCommand("missing PPE");
    expect(result.intent).toBe("SINGLE_ACTION");
    if (result.intent === "SINGLE_ACTION" && result.action.type === "SAFETY_LOG") {
      expect(result.action.project).toBeNull();
      expect(result.action.issue).toBe("missing PPE");
    }
  });

  it("parses LOG_HOURS with worker, hours, and project", async () => {
    const result = await interpretVoiceCommand("Log 4 hours for Guy on the 123 Basement project");
    expect(result.intent).toBe("SINGLE_ACTION");
    if (result.intent === "SINGLE_ACTION" && result.action.type === "LOG_HOURS") {
      expect(result.action).toMatchObject({
        worker: "Guy",
        hours: 4,
        project: "123 Basement project",
      });
      expect(result.confidence).toBe("high");
    }
  });

  it("parses LOG_HOURS with 'worked' phrasing", async () => {
    const result = await interpretVoiceCommand("Sarah worked 8 hours at the Main Street build");
    expect(result.intent).toBe("SINGLE_ACTION");
    if (result.intent === "SINGLE_ACTION" && result.action.type === "LOG_HOURS") {
      expect(result.action).toMatchObject({
        worker: "Sarah",
        hours: 8,
        project: "Main Street build",
      });
    }
  });

  it("parses LOG_HOURS with low confidence when project is missing", async () => {
    const result = await interpretVoiceCommand("log 6 hours for Mike");
    expect(result.intent).toBe("SINGLE_ACTION");
    if (result.intent === "SINGLE_ACTION" && result.action.type === "LOG_HOURS") {
      expect(result.action.project).toBeNull();
      expect(result.confidence).toBe("low");
    }
  });

  /* ─── Compound-action tests ──────────────────────────────────────────────── */

  it("parses compound timesheet + daily log command", async () => {
    const result = await interpretVoiceCommand(
      "Log 4 hours for Guy on the 123 Basement project and note that the sub-grade is wet"
    );
    expect(result.intent).toBe("COMPOUND_ACTION");
    if (result.intent === "COMPOUND_ACTION") {
      expect(result.actions).toHaveLength(2);
      expect(result.actions[0]).toMatchObject({
        type: "LOG_HOURS",
        worker: "Guy",
        hours: 4,
        project: "123 Basement project",
      });
      expect(result.actions[1]).toMatchObject({
        type: "ADD_DAILY_LOG",
        notes: "the sub-grade is wet",
        project: null,
        transcript: "note that the sub-grade is wet",
      });
      expect(result.confidence).toBe("high");
    }
  });

  it("parses compound command with 'also' conjunction", async () => {
    const result = await interpretVoiceCommand(
      "Take a photo of the rebar inspection also log that concrete truck is late"
    );
    expect(result.intent).toBe("COMPOUND_ACTION");
    if (result.intent === "COMPOUND_ACTION") {
      expect(result.actions).toHaveLength(2);
      expect(result.actions[0].type).toBe("TRIGGER_CAMERA");
      expect(result.actions[1].type).toBe("ADD_DAILY_LOG");
    }
  });

  it("falls back to SINGLE_ACTION when only one part of compound matches", async () => {
    const result = await interpretVoiceCommand("log 3 hours for Alex and the weather is nice");
    expect(result.intent).toBe("SINGLE_ACTION");
    if (result.intent === "SINGLE_ACTION" && result.action.type === "LOG_HOURS") {
      expect(result.action.type).toBe("LOG_HOURS");
    }
  });

  /* ─── withActiveProject tests ────────────────────────────────────────────── */

  it("injects active project into LOG_HOURS missing project", async () => {
    const intent = await interpretVoiceCommand("log 5 hours for Joe");
    const enriched = withActiveProject(intent, "Maple Heights");
    if (enriched.intent === "SINGLE_ACTION" && enriched.action.type === "LOG_HOURS") {
      expect(enriched.action.project).toBe("Maple Heights");
    }
  });

  it("injects active project into LOG_OWN_HOURS missing project", async () => {
    const intent = await interpretVoiceCommand("I worked 4 hours");
    const enriched = withActiveProject(intent, "Maple Heights");
    if (enriched.intent === "SINGLE_ACTION" && enriched.action.type === "LOG_OWN_HOURS") {
      expect(enriched.action.project).toBe("Maple Heights");
    }
  });

  it("injects active project into every action in COMPOUND_ACTION", async () => {
    const intent = await interpretVoiceCommand(
      "log 2 hours for Tim and note that drywall is delayed"
    );
    const enriched = withActiveProject(intent, "Riverside Condo");
    if (enriched.intent === "COMPOUND_ACTION") {
      expect(enriched.actions[0]).toMatchObject({
        type: "LOG_HOURS",
        project: "Riverside Condo",
      });
      expect(enriched.actions[1]).toMatchObject({
        type: "ADD_DAILY_LOG",
        project: "Riverside Condo",
        transcript: "note that drywall is delayed",
      });
    }
  });

  it("does not overwrite an already-detected project", async () => {
    const intent = await interpretVoiceCommand("log 4 hours for Guy on the 123 Basement project");
    const enriched = withActiveProject(intent, "Maple Heights");
    if (enriched.intent === "SINGLE_ACTION" && enriched.action.type === "LOG_HOURS") {
      expect(enriched.action.project).toBe("123 Basement project");
    }
  });

  it("passes through non-action intents unchanged", async () => {
    const intent = await interpretVoiceCommand("open the calculator");
    const enriched = withActiveProject(intent, "Maple Heights");
    expect(enriched).toEqual(intent);
  });

  it("does not overwrite ADD_DAILY_LOG project already extracted from transcript", async () => {
    const intent = await interpretVoiceCommand("log that framing is done on 123 Basement");
    const enriched = withActiveProject(intent, "Oak Street");
    if (enriched.intent === "SINGLE_ACTION" && enriched.action.type === "ADD_DAILY_LOG") {
      expect(enriched.action.project).toBe("123 Basement");
    }
  });

  /* ─── Compound + project regression tests ───────────────────────────────── */

  it("compound with project daily-log still produces COMPOUND_ACTION not SINGLE_ACTION", async () => {
    const result = await interpretVoiceCommand(
      "log that framing is done on 123 Basement and mark drywall as complete"
    );
    expect(result.intent).toBe("COMPOUND_ACTION");
    if (result.intent === "COMPOUND_ACTION") {
      expect(result.actions).toHaveLength(2);
      expect(result.actions[0].type).toBe("ADD_DAILY_LOG");
      expect(result.actions[1].type).toBe("MARK_TASK_DONE");
    }
  });

  it("compound LOG_HOURS + daily-log with project is still COMPOUND_ACTION", async () => {
    const result = await interpretVoiceCommand(
      "log 4 hours for Guy on 123 Basement and note that the concrete pour finished on Oak Street"
    );
    expect(result.intent).toBe("COMPOUND_ACTION");
    if (result.intent === "COMPOUND_ACTION") {
      expect(result.actions.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("'add notes to [project] that [notes]' as standalone is SINGLE_ACTION daily-log", async () => {
    const result = await interpretVoiceCommand(
      "add notes to Oak Street that the retaining wall is done"
    );
    expect(result.intent).toBe("SINGLE_ACTION");
    if (result.intent === "SINGLE_ACTION" && result.action.type === "ADD_DAILY_LOG") {
      expect(result.action.project).toBe("Oak Street");
      expect(result.action.notes).toBe("the retaining wall is done");
    }
  });
});

/* ─── LLM fallback mapping tests ────────────────────────────────────────────
 * These tests verify that each LLM response shape is correctly mapped to a
 * VoiceIntent. The `customFetch` mock is overridden per-test to simulate
 * specific model responses. Only unrecognized transcripts reach the LLM.
 * ───────────────────────────────────────────────────────────────────────── */

describe("classifyWithLLM mapping (via interpretVoiceCommand fallback)", () => {
  beforeEach(() => {
    // Reset mock between tests to prevent consumed/unconsumed mockResolvedValueOnce
    // from leaking into the next test when an input is matched by regex before LLM.
    mockCustomFetch().mockReset();
    mockCustomFetch().mockResolvedValue({ intent: "UNKNOWN" });
  });
  it("maps ADD_DAILY_LOG response to SINGLE_ACTION daily log", async () => {
    mockCustomFetch().mockResolvedValueOnce({
      intent: "ADD_DAILY_LOG",
      notes: "weather check done",
      project: "123 Basement",
    });
    const result = await interpretVoiceCommand("jot down that weather check is done");
    expect(result.intent).toBe("SINGLE_ACTION");
    if (result.intent === "SINGLE_ACTION" && result.action.type === "ADD_DAILY_LOG") {
      expect(result.action.notes).toBe("weather check done");
      expect(result.action.project).toBe("123 Basement");
      expect(result.action.transcript).toBe("jot down that weather check is done");
      expect(result.confidence).toBe("low");
    }
  });

  it("maps LOG_HOURS response to SINGLE_ACTION log hours", async () => {
    mockCustomFetch().mockResolvedValueOnce({
      intent: "LOG_HOURS",
      worker: "Marcus",
      hours: 6,
      project: "Oak Street",
    });
    const result = await interpretVoiceCommand("Marcus put in a full day yesterday on Oak Street");
    expect(result.intent).toBe("SINGLE_ACTION");
    if (result.intent === "SINGLE_ACTION" && result.action.type === "LOG_HOURS") {
      expect(result.action.worker).toBe("Marcus");
      expect(result.action.hours).toBe(6);
      expect(result.action.project).toBe("Oak Street");
    }
  });

  it("maps MARK_TASK_DONE response to SINGLE_ACTION mark task done", async () => {
    mockCustomFetch().mockResolvedValueOnce({
      intent: "MARK_TASK_DONE",
      taskName: "electrical rough-in",
      project: null,
    });
    const result = await interpretVoiceCommand("the electrical rough-in is wrapped up");
    expect(result.intent).toBe("SINGLE_ACTION");
    if (result.intent === "SINGLE_ACTION" && result.action.type === "MARK_TASK_DONE") {
      expect(result.action.taskName).toBe("electrical rough-in");
      expect(result.action.project).toBeNull();
    }
  });

  it("maps NAVIGATE response to NAVIGATE intent (valid target)", async () => {
    mockCustomFetch().mockResolvedValueOnce({ intent: "NAVIGATE", target: "Tasks" });
    const result = await interpretVoiceCommand("show me what needs to be done");
    expect(result.intent).toBe("NAVIGATE");
    if (result.intent === "NAVIGATE") {
      expect(result.target).toBe("Tasks");
      expect(result.confidence).toBe("low");
    }
  });

  it("rejects NAVIGATE with invalid target and falls back to dictation", async () => {
    // Use a target that is NOT in ALL_ROUTE_TARGETS so isValidRouteTarget returns false.
    // Use an input that won't match any navigation regex so the LLM path is taken.
    mockCustomFetch().mockResolvedValueOnce({ intent: "NAVIGATE", target: "NotARealScreen" });
    const result = await interpretVoiceCommand("please go to the integration settings panel");
    expect(result.intent).toBe("DATA_ENTRY");
    if (result.intent === "DATA_ENTRY") {
      expect(result.payload).toBe("please go to the integration settings panel");
    }
  });

  it("returns DATA_ENTRY when LLM response fails Zod schema (dictation fallback)", async () => {
    mockCustomFetch().mockResolvedValueOnce({ hours: "not-a-number", intent: "LOG_HOURS" });
    const result = await interpretVoiceCommand("some unrecognized phrase about hours");
    expect(result.intent).toBe("DATA_ENTRY");
    if (result.intent === "DATA_ENTRY") {
      expect(result.payload).toBe("some unrecognized phrase about hours");
    }
  });

  it("returns DATA_ENTRY when customFetch throws (dictation fallback)", async () => {
    mockCustomFetch().mockRejectedValueOnce(new Error("network error"));
    const result = await interpretVoiceCommand("completely unrecognized utterance xyz");
    expect(result.intent).toBe("DATA_ENTRY");
    if (result.intent === "DATA_ENTRY") {
      expect(result.payload).toBe("completely unrecognized utterance xyz");
    }
  });
});
