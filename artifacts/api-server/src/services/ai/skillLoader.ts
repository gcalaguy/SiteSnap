import fs from "fs";
import path from "path";
import { extractJson, extractText } from "@workspace/integrations-openai-ai-server";

// ── AI Skills ────────────────────────────────────────────────────────────────
// Loads the "Skills" packaged under artifacts/api-server/skills/<key>/ — a
// SKILL.md (YAML-ish frontmatter + markdown instructions) plus optional
// templates/*.md, examples.md, reference.md. Skill content is static and
// git-committed (no DB-editable admin UI), so it's read once at process boot
// and held in memory — a deploy is the only way content changes.

// esbuild bundles this file (and everything else) into a single dist/index.mjs,
// so a path relative to this file's own location wouldn't survive the build —
// resolve relative to the process cwd instead, matching the convention used for
// runtime asset dirs elsewhere in this package (see routes/storage.ts's uploads dir).
const SKILLS_DIR = path.resolve(process.cwd(), "skills");
const MAX_PROMPT_CHARS = 20_000; // ~5k tokens

export interface ParsedSkill {
  key: string;
  name: string;
  description: string;
  requiresApproval: boolean;
  restricted: boolean;
  model?: string;
  maxTokens: number;
  outputMode: "json" | "text";
  systemPrompt: string;
}

export interface SkillMeta {
  key: string;
  name: string;
  description: string;
  requiresApproval: boolean;
}

/** Minimal flat `key: value` frontmatter parser — the Skills only need scalar fields, not full YAML. */
function parseFrontmatter(raw: string): { attrs: Record<string, string>; body: string } {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { attrs: {}, body: raw };
  const [, frontmatter, body] = match;
  const attrs: Record<string, string> = {};
  for (const line of frontmatter!.split("\n")) {
    const m = line.match(/^([a-zA-Z][a-zA-Z0-9_]*)\s*:\s*(.*)$/);
    if (!m) continue;
    attrs[m[1]!] = m[2]!.trim().replace(/^["']|["']$/g, "");
  }
  return { attrs, body: body!.trim() };
}

function readIfExists(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, "utf8").trim();
  } catch {
    return null;
  }
}

function loadSkill(dirName: string): ParsedSkill | null {
  const skillDir = path.join(SKILLS_DIR, dirName);
  const skillMd = readIfExists(path.join(skillDir, "SKILL.md"));
  if (!skillMd) return null;

  const { attrs, body } = parseFrontmatter(skillMd);
  const key = attrs.key ?? dirName;

  const sections = [`## Instructions\n${body}`];

  const templatesDir = path.join(skillDir, "templates");
  if (fs.existsSync(templatesDir)) {
    const templateFiles = fs.readdirSync(templatesDir).filter((f) => f.endsWith(".md")).sort();
    for (const f of templateFiles) {
      const content = readIfExists(path.join(templatesDir, f));
      if (content) sections.push(`## Template: ${f}\n${content}`);
    }
  }

  const examples = readIfExists(path.join(skillDir, "examples.md"));
  if (examples) sections.push(`## Examples\n${examples}`);

  const reference = readIfExists(path.join(skillDir, "reference.md"));
  if (reference) sections.push(`## Reference\n${reference}`);

  const systemPrompt = sections.join("\n\n");
  if (systemPrompt.length > MAX_PROMPT_CHARS) {
    // eslint-disable-next-line no-console
    console.warn(
      `[skillLoader] Skill "${key}" system prompt is ${systemPrompt.length} chars (budget ~${MAX_PROMPT_CHARS}) — consider trimming templates/examples.`,
    );
  }

  return {
    key,
    name: attrs.name ?? key,
    description: attrs.description ?? "",
    requiresApproval: attrs.requiresApproval === "true",
    restricted: attrs.restricted === "true",
    model: attrs.model,
    maxTokens: attrs.maxTokens ? parseInt(attrs.maxTokens, 10) : 2048,
    outputMode: attrs.outputMode === "text" ? "text" : "json",
    systemPrompt,
  };
}

function loadAllSkillsSync(): Map<string, ParsedSkill> {
  const map = new Map<string, ParsedSkill>();
  let dirNames: string[] = [];
  try {
    dirNames = fs.readdirSync(SKILLS_DIR, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
  } catch {
    return map;
  }
  for (const dirName of dirNames) {
    const skill = loadSkill(dirName);
    if (skill) map.set(skill.key, skill);
  }
  return map;
}

const SKILLS = loadAllSkillsSync();

/** Returns skill metadata for the picker UI, filtering out restricted skills for workers. */
export function listSkills(role: string): SkillMeta[] {
  return [...SKILLS.values()]
    .filter((s) => role !== "worker" || !s.restricted)
    .map(({ key, name, description, requiresApproval }) => ({ key, name, description, requiresApproval }));
}

export function getSkill(skillKey: string): ParsedSkill | null {
  return SKILLS.get(skillKey) ?? null;
}

/** Keys of skills workers may never generate or view (e.g. incident/near-miss writeups). */
export function restrictedSkillKeys(): string[] {
  return [...SKILLS.values()].filter((s) => s.restricted).map((s) => s.key);
}

export interface SkillRunInput {
  notes: string;
  [key: string]: unknown;
}

/** Runs a skill against the given inputs, returning the parsed JSON/text output. */
export async function runSkill(
  skillKey: string,
  inputs: SkillRunInput,
): Promise<{ skill: ParsedSkill; outputJson: Record<string, unknown> | null; outputText: string | null }> {
  const skill = getSkill(skillKey);
  if (!skill) throw new Error(`Unknown skill: ${skillKey}`);

  const userPrompt = `Field notes / input:\n${inputs.notes}`;

  if (skill.outputMode === "json") {
    const result = await extractJson<Record<string, unknown>>({
      systemPrompt: skill.systemPrompt,
      prompt: userPrompt,
      model: skill.model,
      jsonMode: true,
      maxTokens: skill.maxTokens,
      fallback: { error: "Could not parse structured response." },
    });
    return { skill, outputJson: result, outputText: null };
  }

  const text = await extractText({
    prompt: `${skill.systemPrompt}\n\n${userPrompt}`,
    images: [],
    model: skill.model,
    maxTokens: skill.maxTokens,
  });
  return { skill, outputJson: null, outputText: text };
}
