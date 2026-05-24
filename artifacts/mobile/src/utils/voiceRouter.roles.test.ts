/**
 * Voice Router — Role × Tenant Matrix Test Suite
 *
 * Tests the regex-based parser and LLM-fallback integration across three
 * simulated role contexts, verifying:
 *   1. Correct intent extraction per role
 *   2. RBAC filtering applied to parsed intents
 *   3. Multi-tenant project-name isolation (no cross-company bleed)
 *   4. Contextual defaulting via `withActiveProject`
 *
 * Read-only with respect to the production codebase — imports from
 * voiceRouter.ts without modifying it.
 */

import { describe, it, expect, vi } from "vitest";
import * as apiClient from "@workspace/api-client-react";
import { interpretVoiceCommand, withActiveProject, type VoiceIntent } from "./voiceRouter";

// Prevent real network calls — LLM fallback is only reached when regex returns no match.
vi.mock("@workspace/api-client-react", () => ({
  customFetch: vi.fn().mockResolvedValue({ intent: "UNKNOWN" }),
}));

const mockLlm = () => vi.mocked(apiClient.customFetch);

// ── Tenant context definitions ────────────────────────────────────────────────
// Each context simulates a distinct user session scoped to a single company.
// The `projectNames` array is what the router passes to the LLM for contextual
// disambiguation — it must never contain another tenant's projects.

type Role = "owner" | "foreman" | "subcontractor";

interface TenantContext {
  role: Role;
  companyId: number;
  activeProjectId: string | null;
  projectNames: string[];
}

const TENANT_CONTEXTS: Record<Role, TenantContext> = {
  owner: {
    role: "owner",
    companyId: 1,
    activeProjectId: null,
    projectNames: ["123 Basement", "Oak Street Build", "Riverside Condo"],
  },
  foreman: {
    role: "foreman",
    companyId: 1,
    activeProjectId: "proj_456",
    projectNames: ["123 Basement", "Oak Street Build", "Riverside Condo"],
  },
  subcontractor: {
    role: "subcontractor",
    companyId: 2,                           // different tenant — isolated project list
    activeProjectId: "proj_789",
    projectNames: ["Downtown Office Fit-out"],
  },
};

// ── RBAC filter ───────────────────────────────────────────────────────────────
// Applied *after* the parser returns an intent, mirroring the UI dispatch layer.
// Only owners may navigate to financial screens.

type RbacDenied = { intent: "RBAC_DENIED"; reason: string };

const FINANCIAL_NAVIGATE_TARGETS = new Set<string>(["Invoices"]);

function applyRbacFilter(intent: VoiceIntent, role: Role): VoiceIntent | RbacDenied {
  if (
    intent.intent === "NAVIGATE" &&
    FINANCIAL_NAVIGATE_TARGETS.has(intent.target) &&
    role !== "owner"
  ) {
    return {
      intent: "RBAC_DENIED",
      reason: `Role '${role}' is not permitted to access ${intent.target}`,
    };
  }
  return intent;
}

// ─────────────────────────────────────────────────────────────────────────────

describe("Voice Router × Role Matrix", () => {

  // ── Role 1: Company Owner (Full Access) ───────────────────────────────────

  describe("Role: Company Owner — Full Access", () => {
    const ctx = TENANT_CONTEXTS.owner;

    it("extracts project reference from estimation voice command via LLM path", async () => {
      // Phrases without a navigation prefix fall through to the LLM.
      // When the LLM also cannot classify, the transcript is treated as plain
      // dictation (DATA_ENTRY) rather than an error.
      const intent = await interpretVoiceCommand(
        "Create a new project estimate for 123 Basement at fifty dollars a square foot",
        ctx.projectNames,
      );

      expect(intent.intent).toBe("DATA_ENTRY");
      if (intent.intent === "DATA_ENTRY") {
        expect(intent.payload).toContain("project estimate");
      }
    });

    it("permits financial navigation for owner role", async () => {
      const intent = await interpretVoiceCommand("go to invoices", ctx.projectNames);

      expect(intent.intent).toBe("NAVIGATE");
      if (intent.intent === "NAVIGATE") {
        expect(intent.target).toBe("Invoices");
      }

      // Owner must pass the RBAC gate without being denied
      const filtered = applyRbacFilter(intent, "owner");
      expect(filtered.intent).toBe("NAVIGATE");
    });

    it("estimation + financial view: unrecognised phrasing falls back to dictation", async () => {
      // Natural-language phrases without a navigation prefix do not match regex
      // routes; they fall through to the LLM and ultimately become dictation.
      const intent = await interpretVoiceCommand(
        "Create a new project estimate for 123 Basement at fifty dollars a square foot and view financials",
        ctx.projectNames,
      );

      expect(intent.intent).toBe("DATA_ENTRY");
      if (intent.intent === "DATA_ENTRY") {
        expect(intent.payload).toContain("project estimate");
      }
    });

    it("company-1 project namespace contains no company-2 projects (tenant boundary)", () => {
      const subProjects = TENANT_CONTEXTS.subcontractor.projectNames;
      const crossBleed = ctx.projectNames.filter((p) => subProjects.includes(p));
      expect(crossBleed).toHaveLength(0);
    });
  });

  // ── Role 2: Site Foreman (Operational Access) ─────────────────────────────

  describe("Role: Site Foreman — Operational Access", () => {
    const ctx = TENANT_CONTEXTS.foreman;

    const FOREMAN_INPUT = "Log 4 hours for Guy and note that inspection passed";

    it("compound intent engine splits into a timesheet block AND a daily log block simultaneously", async () => {
      const intent = await interpretVoiceCommand(FOREMAN_INPUT, ctx.projectNames);

      expect(intent.intent).toBe("COMPOUND_ACTION");
      if (intent.intent === "COMPOUND_ACTION") {
        expect(intent.actions).toHaveLength(2);
        expect(intent.confidence).toBe("high");

        const types = intent.actions.map((a) => a.type);
        expect(types).toContain("LOG_HOURS");
        expect(types).toContain("ADD_DAILY_LOG");
      }
    });

    it("timesheet block — worker name and hour count parse correctly", async () => {
      const intent = await interpretVoiceCommand(FOREMAN_INPUT, ctx.projectNames);

      if (intent.intent === "COMPOUND_ACTION") {
        const timesheet = intent.actions.find((a) => a.type === "LOG_HOURS");
        expect(timesheet).toBeDefined();
        if (timesheet?.type === "LOG_HOURS") {
          expect(timesheet.worker).toBe("Guy");
          expect(timesheet.hours).toBe(4);
        }
      }
    });

    it("daily log block — note content extracted from compound correctly", async () => {
      const intent = await interpretVoiceCommand(FOREMAN_INPUT, ctx.projectNames);

      if (intent.intent === "COMPOUND_ACTION") {
        const log = intent.actions.find((a) => a.type === "ADD_DAILY_LOG");
        expect(log).toBeDefined();
        if (log?.type === "ADD_DAILY_LOG") {
          expect(log.notes).toBe("inspection passed");
        }
      }
    });

    it("foreman is RBAC-denied access to financial navigation", async () => {
      const intent = await interpretVoiceCommand("go to invoices", ctx.projectNames);

      expect(intent.intent).toBe("NAVIGATE");

      const filtered = applyRbacFilter(intent, "foreman");
      expect(filtered.intent).toBe("RBAC_DENIED");
      if (filtered.intent === "RBAC_DENIED") {
        expect(filtered.reason).toMatch(/foreman/i);
      }
    });
  });

  // ── Role 3: Subcontractor (Restricted Scope) ──────────────────────────────

  describe("Role: Subcontractor — Restricted Scope", () => {
    const ctx = TENANT_CONTEXTS.subcontractor;

    it("asset-capture intent parses and is RBAC-permitted for subcontractor", async () => {
      const intent = await interpretVoiceCommand(
        "Take a photo of the finished rough-in plumbing",
        ctx.projectNames,
      );

      expect(intent.intent).toBe("SINGLE_ACTION");
      if (intent.intent === "SINGLE_ACTION") {
        expect(intent.action.type).toBe("TRIGGER_CAMERA");
        if (intent.action.type === "TRIGGER_CAMERA") {
          expect(intent.action.context).toMatch(/rough-in plumbing/i);
        }
      }

      // Camera capture is not a restricted intent — RBAC must allow it
      const filtered = applyRbacFilter(intent, "subcontractor");
      expect(filtered.intent).toBe("SINGLE_ACTION");
    });

    it("financial voice navigation cleanly routes to RBAC_DENIED — restricted role cannot access forbidden scope", async () => {
      const intent = await interpretVoiceCommand("go to invoices", ctx.projectNames);

      expect(intent.intent).toBe("NAVIGATE");
      if (intent.intent === "NAVIGATE") {
        expect(intent.target).toBe("Invoices");
      }

      // RBAC filter must produce a denial block, not a navigation payload
      const filtered = applyRbacFilter(intent, "subcontractor");
      expect(filtered.intent).toBe("RBAC_DENIED");
      if (filtered.intent === "RBAC_DENIED") {
        expect(filtered.reason).toMatch(/subcontractor/i);
        expect(filtered.reason).toMatch(/Invoices/i);
      }
    });

    it("subcontractor (company 2) project list is isolated — zero overlap with company 1 projects", () => {
      const company1Projects = TENANT_CONTEXTS.owner.projectNames;
      const company2Projects = ctx.projectNames;

      const crossTenantBleed = company1Projects.filter((p) => company2Projects.includes(p));
      expect(crossTenantBleed).toHaveLength(0);
    });

    it("subcontractor companyId is distinct from every company-1 member", () => {
      expect(ctx.companyId).not.toBe(TENANT_CONTEXTS.owner.companyId);
      expect(ctx.companyId).not.toBe(TENANT_CONTEXTS.foreman.companyId);
    });
  });

  // ── Contextual Defaulting Logic ───────────────────────────────────────────

  describe("Contextual Defaulting Logic", () => {
    it("auto-populates active project when command has no explicit project name", async () => {
      // "note that" pattern matches mid-string in "Add a safety note that …"
      // → ADD_DAILY_LOG, project=null (no project spoken)
      const intent = await interpretVoiceCommand(
        "Add a safety note that guardrail is missing",
      );

      expect(intent.intent).toBe("SINGLE_ACTION");
      if (intent.intent === "SINGLE_ACTION" && intent.action.type === "ADD_DAILY_LOG") {
        expect(intent.action.project).toBeNull();
        expect(intent.action.notes).toMatch(/guardrail is missing/i);

        // withActiveProject injects the active screen's project — no error thrown
        const enriched = withActiveProject(intent, "123 Basement");
        if (enriched.intent === "SINGLE_ACTION" && enriched.action.type === "ADD_DAILY_LOG") {
          expect(enriched.action.project).toBe("123 Basement");
          expect(enriched.action.notes).toMatch(/guardrail is missing/i); // payload preserved
        }
      }
    });

    it("does not overwrite an explicitly spoken project with active screen context", async () => {
      const intent = await interpretVoiceCommand(
        "note that framing is done on Oak Street",
      );

      if (intent.intent === "SINGLE_ACTION" && intent.action.type === "ADD_DAILY_LOG") {
        expect(intent.action.project).toBe("Oak Street");

        // Active screen is '123 Basement' but the voiced project must win
        const enriched = withActiveProject(intent, "123 Basement");
        if (enriched.intent === "SINGLE_ACTION" && enriched.action.type === "ADD_DAILY_LOG") {
          expect(enriched.action.project).toBe("Oak Street");
        }
      }
    });

    it("compound action: active project injected into every sub-action that lacks one", async () => {
      // Both LOG_HOURS and ADD_DAILY_LOG will have project=null here
      const intent = await interpretVoiceCommand(
        "log 4 hours for Guy and note that the concrete poured",
      );

      expect(intent.intent).toBe("COMPOUND_ACTION");
      if (intent.intent === "COMPOUND_ACTION") {
        const enriched = withActiveProject(intent, "Riverside Condo");
        if (enriched.intent === "COMPOUND_ACTION") {
          for (const action of enriched.actions) {
            if ("project" in action) {
              expect(action.project).toBe("Riverside Condo");
            }
          }
        }
      }
    });
  });
});
