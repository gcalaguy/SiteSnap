import { describe, it, expect } from "vitest";
import { interpretVoiceCommand } from "./voiceRouter";

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
});
