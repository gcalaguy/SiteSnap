import { describe, it, expect, vi } from "vitest";
import { interpretVoiceCommand, withActiveProject } from "./voiceRouter";

// Prevent real network calls — LLM fallback is only reached when regex returns UNKNOWN
vi.mock("@workspace/api-client-react", () => ({
  customFetch: vi.fn().mockResolvedValue({ intent: "UNKNOWN" }),
}));

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

  it("returns UNKNOWN for unrecognized phrase (falls through to LLM mock)", async () => {
    const result = await interpretVoiceCommand("What is the weather today?");
    expect(result.intent).toBe("UNKNOWN");
    expect(result.confidence).toBe("low");
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
    const result = await interpretVoiceCommand("Open The CONCRETE Calculator");
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
    const result = await interpretVoiceCommand("take me to my projects");
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

  it("navigates to Reports", async () => {
    const result = await interpretVoiceCommand("show today's reports");
    expect(result.intent).toBe("NAVIGATE");
    if (result.intent === "NAVIGATE") {
      expect(result.target).toBe("Reports");
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
    }
  });

  it("parses ADD_DAILY_LOG via 'update the [project] project'", async () => {
    const result = await interpretVoiceCommand("update the Oak Street project");
    expect(result.intent).toBe("SINGLE_ACTION");
    if (result.intent === "SINGLE_ACTION" && result.action.type === "ADD_DAILY_LOG") {
      expect(result.action.project).toBe("Oak Street");
    }
  });

  it("parses ADD_DAILY_LOG via 'update [project] that [notes]'", async () => {
    const result = await interpretVoiceCommand("update 123 Basement that the concrete pour finished");
    expect(result.intent).toBe("SINGLE_ACTION");
    if (result.intent === "SINGLE_ACTION" && result.action.type === "ADD_DAILY_LOG") {
      expect(result.action.project).toBe("123 Basement");
      expect(result.action.notes).toBe("the concrete pour finished");
    }
  });

  it("parses ADD_DAILY_LOG via 'add notes to [project] that [notes]'", async () => {
    const result = await interpretVoiceCommand("add notes to 123 Basement that the concrete pour finished");
    expect(result.intent).toBe("SINGLE_ACTION");
    if (result.intent === "SINGLE_ACTION" && result.action.type === "ADD_DAILY_LOG") {
      expect(result.action.project).toBe("123 Basement");
      expect(result.action.notes).toBe("the concrete pour finished");
    }
  });

  it("parses ADD_DAILY_LOG via 'log that [notes] on [project]' — captures project", async () => {
    const result = await interpretVoiceCommand("log that framing is done on 123 Basement");
    expect(result.intent).toBe("SINGLE_ACTION");
    if (result.intent === "SINGLE_ACTION" && result.action.type === "ADD_DAILY_LOG") {
      expect(result.action.project).toBe("123 Basement");
      expect(result.action.notes).toBe("framing is done");
    }
  });

  it("parses ADD_DAILY_LOG via 'note that' with no project", async () => {
    const result = await interpretVoiceCommand("note that workers arrived late");
    expect(result.intent).toBe("SINGLE_ACTION");
    if (result.intent === "SINGLE_ACTION" && result.action.type === "ADD_DAILY_LOG") {
      expect(result.action.project).toBeNull();
      expect(result.action.notes).toBe("workers arrived late");
    }
  });

  it("parses ADD_DAILY_LOG via 'note that' with no project (legacy test)", async () => {
    const result = await interpretVoiceCommand("note that the sub-grade is wet");
    expect(result.intent).toBe("SINGLE_ACTION");
    if (result.intent === "SINGLE_ACTION" && result.action.type === "ADD_DAILY_LOG") {
      expect(result.action).toMatchObject({
        notes: "the sub-grade is wet",
        project: null,
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
});
