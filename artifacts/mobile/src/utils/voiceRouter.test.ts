import { describe, it, expect } from "vitest";
import { interpretVoiceCommand, withActiveProject } from "./voiceRouter";

describe("interpretVoiceCommand", () => {
  it("returns UNKNOWN for empty string", () => {
    const result = interpretVoiceCommand("");
    expect(result.intent).toBe("UNKNOWN");
    expect(result.confidence).toBe("low");
  });

  it("returns UNKNOWN for whitespace-only input", () => {
    const result = interpretVoiceCommand("   ");
    expect(result.intent).toBe("UNKNOWN");
    expect(result.confidence).toBe("low");
  });

  it("returns UNKNOWN for unrecognized phrase", () => {
    const result = interpretVoiceCommand("What is the weather today?");
    expect(result.intent).toBe("UNKNOWN");
    expect(result.confidence).toBe("low");
  });

  it("navigates to Calculators (lowercase)", () => {
    const result = interpretVoiceCommand("open the calculator");
    expect(result.intent).toBe("NAVIGATE");
    if (result.intent === "NAVIGATE") {
      expect(result.target).toBe("Calculators");
      expect(result.confidence).toBe("high");
    }
  });

  it("navigates to Calculators (mixed case)", () => {
    const result = interpretVoiceCommand("Open The CONCRETE Calculator");
    expect(result.intent).toBe("NAVIGATE");
    if (result.intent === "NAVIGATE") {
      expect(result.target).toBe("Calculators");
    }
  });

  it("navigates to Schedule", () => {
    const result = interpretVoiceCommand("show me the schedule");
    expect(result.intent).toBe("NAVIGATE");
    if (result.intent === "NAVIGATE") {
      expect(result.target).toBe("Schedule");
    }
  });

  it("navigates to Schedule via calendar keyword", () => {
    const result = interpretVoiceCommand("go to calendar");
    expect(result.intent).toBe("NAVIGATE");
    if (result.intent === "NAVIGATE") {
      expect(result.target).toBe("Schedule");
    }
  });

  it("navigates to Projects", () => {
    const result = interpretVoiceCommand("take me to my projects");
    expect(result.intent).toBe("NAVIGATE");
    if (result.intent === "NAVIGATE") {
      expect(result.target).toBe("Projects");
    }
  });

  it("navigates to Ask via assistant keyword", () => {
    const result = interpretVoiceCommand("open the assistant");
    expect(result.intent).toBe("NAVIGATE");
    if (result.intent === "NAVIGATE") {
      expect(result.target).toBe("Ask");
    }
  });

  it("navigates to Tasks", () => {
    const result = interpretVoiceCommand("open my tasks");
    expect(result.intent).toBe("NAVIGATE");
    if (result.intent === "NAVIGATE") {
      expect(result.target).toBe("Tasks");
    }
  });

  it("navigates to Invoices", () => {
    const result = interpretVoiceCommand("go to invoices");
    expect(result.intent).toBe("NAVIGATE");
    if (result.intent === "NAVIGATE") {
      expect(result.target).toBe("Invoices");
    }
  });

  it("navigates to Reports", () => {
    const result = interpretVoiceCommand("show today's reports");
    expect(result.intent).toBe("NAVIGATE");
    if (result.intent === "NAVIGATE") {
      expect(result.target).toBe("Reports");
    }
  });

  it("returns DATA_ENTRY with sanitized payload for a note", () => {
    const result = interpretVoiceCommand("add a note concrete pour went well today");
    expect(result.intent).toBe("DATA_ENTRY");
    if (result.intent === "DATA_ENTRY") {
      expect(result.action).toBe("ADD_NOTE");
      expect(result.payload).toBe("concrete pour went well today");
      expect(result.confidence).toBe("high");
    }
  });

  it("returns DATA_ENTRY for 'create note' variant", () => {
    const result = interpretVoiceCommand("create note site inspection complete");
    expect(result.intent).toBe("DATA_ENTRY");
    if (result.intent === "DATA_ENTRY") {
      expect(result.payload).toBe("site inspection complete");
    }
  });

  it("returns DATA_ENTRY with low confidence when note has no content", () => {
    const result = interpretVoiceCommand("add a note");
    expect(result.intent).toBe("DATA_ENTRY");
    if (result.intent === "DATA_ENTRY") {
      expect(result.payload).toBe("");
      expect(result.confidence).toBe("low");
    }
  });

  it("caps DATA_ENTRY payload at 500 characters", () => {
    const longText = "x".repeat(600);
    const result = interpretVoiceCommand(`add a note ${longText}`);
    expect(result.intent).toBe("DATA_ENTRY");
    if (result.intent === "DATA_ENTRY") {
      expect(result.payload.length).toBe(500);
    }
  });

  it("DATA_ENTRY takes priority over NAVIGATE when both could match", () => {
    const result = interpretVoiceCommand("add a note check the project schedule");
    expect(result.intent).toBe("DATA_ENTRY");
  });

  /* ─── New command tests ─────────────────────────────────────────────────────────────────────── */

  it("parses LOG_OWN_HOURS with project", () => {
    const result = interpretVoiceCommand("I worked 5 hours on Oak Street today");
    expect(result.intent).toBe("SINGLE_ACTION");
    if (result.intent === "SINGLE_ACTION" && result.action.type === "LOG_OWN_HOURS") {
      expect(result.action.hours).toBe(5);
      expect(result.action.project).toBe("Oak Street today");
    }
  });

  it("parses LOG_OWN_HOURS with 'for myself'", () => {
    const result = interpretVoiceCommand("log 3 hours for myself on Main Street");
    expect(result.intent).toBe("SINGLE_ACTION");
    if (result.intent === "SINGLE_ACTION" && result.action.type === "LOG_OWN_HOURS") {
      expect(result.action.hours).toBe(3);
      expect(result.action.project).toBe("Main Street");
    }
  });

  it("parses MARK_TASK_DONE", () => {
    const result = interpretVoiceCommand("mark the framing inspection as complete");
    expect(result.intent).toBe("SINGLE_ACTION");
    if (result.intent === "SINGLE_ACTION" && result.action.type === "MARK_TASK_DONE") {
      expect(result.action.taskName).toBe("framing inspection");
    }
  });

  it("parses MARK_TASK_DONE via 'complete'", () => {
    const result = interpretVoiceCommand("complete the drywall");
    expect(result.intent).toBe("SINGLE_ACTION");
    if (result.intent === "SINGLE_ACTION" && result.action.type === "MARK_TASK_DONE") {
      expect(result.action.taskName).toBe("drywall");
    }
  });

  it("parses LOG_DELAY with weather", () => {
    const result = interpretVoiceCommand("log a 2-hour weather delay on Oak Street");
    expect(result.intent).toBe("SINGLE_ACTION");
    if (result.intent === "SINGLE_ACTION" && result.action.type === "LOG_DELAY") {
      expect(result.action.hours).toBe(2);
      expect(result.action.reason).toBe("weather");
      expect(result.action.project).toBe("Oak Street");
    }
  });

  it("parses LOG_EXPENSE with vendor and project", () => {
    const result = interpretVoiceCommand("expense $250 for lumber at Home Depot on Oak Street");
    expect(result.intent).toBe("SINGLE_ACTION");
    if (result.intent === "SINGLE_ACTION" && result.action.type === "LOG_EXPENSE") {
      expect(result.action.amount).toBe(250);
      expect(result.action.description).toBe("lumber");
      expect(result.action.vendor).toBe("Home Depot");
      expect(result.action.project).toBe("Oak Street");
    }
  });

  it("parses CREATE_RFI with project", () => {
    const result = interpretVoiceCommand("create an RFI about the beam size on Oak Street");
    expect(result.intent).toBe("SINGLE_ACTION");
    if (result.intent === "SINGLE_ACTION" && result.action.type === "CREATE_RFI") {
      expect(result.action.subject).toBe("beam size");
      expect(result.action.project).toBe("Oak Street");
    }
  });

  /* ─── Existing Dirty Hands tests ────────────────────────────────────────────── */

  it("parses LOG_HOURS with worker, hours, and project", () => {
    const result = interpretVoiceCommand("Log 4 hours for Guy on the 123 Basement project");
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

  it("parses LOG_HOURS with 'worked' phrasing", () => {
    const result = interpretVoiceCommand("Sarah worked 8 hours at the Main Street build");
    expect(result.intent).toBe("SINGLE_ACTION");
    if (result.intent === "SINGLE_ACTION" && result.action.type === "LOG_HOURS") {
      expect(result.action).toMatchObject({
        worker: "Sarah",
        hours: 8,
        project: "Main Street build",
      });
    }
  });

  it("parses LOG_HOURS with low confidence when project is missing", () => {
    const result = interpretVoiceCommand("log 6 hours for Mike");
    expect(result.intent).toBe("SINGLE_ACTION");
    if (result.intent === "SINGLE_ACTION" && result.action.type === "LOG_HOURS") {
      expect(result.action.project).toBeNull();
      expect(result.confidence).toBe("low");
    }
  });

  it("parses ADD_DAILY_LOG via 'note that'", () => {
    const result = interpretVoiceCommand("note that the sub-grade is wet");
    expect(result.intent).toBe("SINGLE_ACTION");
    if (result.intent === "SINGLE_ACTION" && result.action.type === "ADD_DAILY_LOG") {
      expect(result.action).toMatchObject({
        notes: "the sub-grade is wet",
        project: null,
      });
    }
  });

  it("parses MATERIAL_ALERT for 'short on'", () => {
    const result = interpretVoiceCommand("We are short on 2x4 studs");
    expect(result.intent).toBe("SINGLE_ACTION");
    if (result.intent === "SINGLE_ACTION" && result.action.type === "MATERIAL_ALERT") {
      expect(result.action).toMatchObject({
        item: "2x4 studs",
        project: null,
      });
    }
  });

  it("parses MATERIAL_ALERT for 'need' phrasing", () => {
    const result = interpretVoiceCommand("need more concrete");
    expect(result.intent).toBe("SINGLE_ACTION");
    if (result.intent === "SINGLE_ACTION" && result.action.type === "MATERIAL_ALERT") {
      expect(result.action.item).toBe("more concrete");
    }
  });

  it("parses TRIGGER_CAMERA with context", () => {
    const result = interpretVoiceCommand("Take a photo of the foundation crack");
    expect(result.intent).toBe("SINGLE_ACTION");
    if (result.intent === "SINGLE_ACTION" && result.action.type === "TRIGGER_CAMERA") {
      expect(result.action).toMatchObject({
        context: "the foundation crack",
      });
    }
  });

  it("parses TRIGGER_CAMERA without context", () => {
    const result = interpretVoiceCommand("Take a photo");
    expect(result.intent).toBe("SINGLE_ACTION");
    if (result.intent === "SINGLE_ACTION" && result.action.type === "TRIGGER_CAMERA") {
      expect(result.action.context).toBeNull();
    }
  });

  it("parses SAFETY_LOG with project", () => {
    const result = interpretVoiceCommand("Subcontractor missing PPE at 123 Basement");
    expect(result.intent).toBe("SINGLE_ACTION");
    if (result.intent === "SINGLE_ACTION" && result.action.type === "SAFETY_LOG") {
      expect(result.action).toMatchObject({
        project: "123 Basement",
        issue: "missing PPE",
      });
    }
  });

  it("parses SAFETY_LOG without project", () => {
    const result = interpretVoiceCommand("missing PPE");
    expect(result.intent).toBe("SINGLE_ACTION");
    if (result.intent === "SINGLE_ACTION" && result.action.type === "SAFETY_LOG") {
      expect(result.action.project).toBeNull();
      expect(result.action.issue).toBe("missing PPE");
    }
  });

  /* ─── Compound-action tests ──────────────────────────────────────────── */

  it("parses compound timesheet + daily log command", () => {
    const result = interpretVoiceCommand(
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

  it("parses compound command with 'also' conjunction", () => {
    const result = interpretVoiceCommand(
      "Take a photo of the rebar inspection also log that concrete truck is late"
    );
    expect(result.intent).toBe("COMPOUND_ACTION");
    if (result.intent === "COMPOUND_ACTION") {
      expect(result.actions).toHaveLength(2);
      expect(result.actions[0].type).toBe("TRIGGER_CAMERA");
      expect(result.actions[1].type).toBe("ADD_DAILY_LOG");
    }
  });

  it("falls back to SINGLE_ACTION when only one part of compound matches", () => {
    const result = interpretVoiceCommand("log 3 hours for Alex and the weather is nice");
    expect(result.intent).toBe("SINGLE_ACTION");
    if (result.intent === "SINGLE_ACTION" && result.action.type === "LOG_HOURS") {
      expect(result.action.type).toBe("LOG_HOURS");
    }
  });

  /* ─── withActiveProject tests ────────────────────────────────────────── */

  it("injects active project into LOG_HOURS missing project", () => {
    const intent = interpretVoiceCommand("log 5 hours for Joe");
    const enriched = withActiveProject(intent, "Maple Heights");
    if (enriched.intent === "SINGLE_ACTION" && enriched.action.type === "LOG_HOURS") {
      expect(enriched.action.project).toBe("Maple Heights");
    }
  });

  it("injects active project into LOG_OWN_HOURS missing project", () => {
    const intent = interpretVoiceCommand("I worked 4 hours");
    const enriched = withActiveProject(intent, "Maple Heights");
    if (enriched.intent === "SINGLE_ACTION" && enriched.action.type === "LOG_OWN_HOURS") {
      expect(enriched.action.project).toBe("Maple Heights");
    }
  });

  it("injects active project into every action in COMPOUND_ACTION", () => {
    const intent = interpretVoiceCommand(
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

  it("does not overwrite an already-detected project", () => {
    const intent = interpretVoiceCommand("log 4 hours for Guy on the 123 Basement project");
    const enriched = withActiveProject(intent, "Maple Heights");
    if (enriched.intent === "SINGLE_ACTION" && enriched.action.type === "LOG_HOURS") {
      expect(enriched.action.project).toBe("123 Basement project");
    }
  });

  it("passes through non-action intents unchanged", () => {
    const intent = interpretVoiceCommand("open the calculator");
    const enriched = withActiveProject(intent, "Maple Heights");
    expect(enriched).toEqual(intent);
  });
});
