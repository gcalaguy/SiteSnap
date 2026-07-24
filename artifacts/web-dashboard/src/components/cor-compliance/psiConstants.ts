// Mirrors lib/db/src/schema/psi.ts (PSI_HAZARD_CATEGORIES).
// Duplicated here since web-dashboard doesn't depend on @workspace/db.

export const PSI_HAZARD_CATEGORIES = {
  environmental: {
    title: "Environmental Hazards",
    hasOther: true,
    items: [
      "Exposure to Chemicals",
      "MSDS/SDS Available",
      "Weather Conditions",
      "Ventilation",
      "Heat Stress/Cold Stress",
      "Soil Conditions",
      "Noise Levels",
    ],
  },
  ergonomic: {
    title: "Ergonomic Hazards",
    hasOther: true,
    items: [
      "Working In Tight Area",
      "Awkward Posture",
      "Forceful Exertion",
      "Working Above Your Head",
      "Pinch Points Identified",
      "Repetitive Motion",
      "Vibration",
    ],
  },
  ppe: {
    title: "Ensure PPE Requirements",
    hasOther: true,
    otherLabel: "Additional PPE Required",
    items: [
      "Head Protection",
      "Foot Protection",
      "Hi Vis Vest",
      "Gloves",
      "Fall Protection",
      "Hearing Protection",
      "Respiratory Protection",
    ],
  },
  workingAtHeight: {
    title: "Working at Height Hazards",
    hasOther: true,
    items: [
      "Falls from Height",
      "Fall Protection Equipment Required",
      "Hoisting or Moving Loads",
      "Guardrails/Handrails Required",
      "Protective Floor Coverings Required",
      "Objects/Debris Falling from Above",
      "Others Working Overhead/Below",
      "Work Platform",
      "Ladders",
    ],
  },
  activity: {
    title: "Activity Hazards",
    hasOther: true,
    items: [
      "Working with Hand Tools",
      "Operating Power Equipment/Tools",
      "Operating Motor Vehicle/Heavy Machinery",
      "Burn/Heat Sources/Flammable Gases",
      "Compressed Gasses",
      "Energized Equipment in Area",
      "Electrical Cords/Tools – Condition",
      "Permits Required",
      "Lockout Required",
    ],
  },
  equipment: {
    title: "Equipment/Machinery Checklist",
    hasOther: false,
    items: [
      "Operators Manual Available",
      "Daily Inspection (Circle Check) Completed",
      "Operator Proof of Training Available",
      "Equipment/Tools Inspected",
      "Fire Extinguisher",
      "First Aid Kit",
    ],
  },
  trafficControl: {
    title: "Traffic Control Hazards",
    hasOther: true,
    items: [
      "Traffic Control Person Needed",
      "Traffic Control Devices (Signs, Signals, Barricades, Pylons, etc) Needed",
      "Pedestrians/Other Workers Around Work Area",
      "Nighttime Work (Dark Outside)",
      "Vehicle Reversing/Backing Up",
      "Moving Machinery/Equipment",
      "Collision with Traffic",
      "Uneven Roads",
    ],
  },
  personalLimitation: {
    title: "Personal Limitation Hazards",
    hasOther: false,
    items: [
      "Physical Limitations – Need Assistance",
      "Mental Limitations/Distraction in Work Area",
      "Training Required to Complete Task",
      "Buddy System Required",
      "Unclear Work Instructions",
      "Locates Need to Be Identified",
      "Procedure Not Available for Task",
    ],
  },
  additionalEquipment: {
    title: "Additional Equipment/Machinery",
    hasOther: true,
    hasOther2: true,
    hasOther3: true,
    items: [
      "Operators Manual Available",
      "Daily Inspection (Circle Check) Completed",
      "Operator Proof of Training Available",
      "Equipment/Tools Inspected",
      "Fire Extinguisher",
      "First Aid Kit",
    ],
  },
} as const;

export type PsiHazardCategoryKey = keyof typeof PSI_HAZARD_CATEGORIES;

export const PSI_HAZARD_CATEGORY_KEYS = Object.keys(PSI_HAZARD_CATEGORIES) as PsiHazardCategoryKey[];

// ── Shared types (mirror API shapes returned by /api/psi routes) ──────────────

export interface PsiHazardCategoryValue {
  checked: string[];
  otherText?: string;
  other2Text?: string;
  other3Text?: string;
}

export type PsiHazards = Record<PsiHazardCategoryKey, PsiHazardCategoryValue>;

export interface PsiTaskRow {
  id: string;
  task: string;
  hazard: string;
  control: string;
}

export interface PsiVoiceNote {
  id: string;
  transcript: string;
  recordedAt: string;
  audioUrl?: string | null;
}

export function emptyPsiHazards(): PsiHazards {
  const result = {} as PsiHazards;
  for (const key of PSI_HAZARD_CATEGORY_KEYS) {
    result[key] = { checked: [] };
  }
  return result;
}

export interface PsiChecklist {
  id: number;
  companyId: number;
  projectId: number;
  createdByUserId: number;
  date: string;
  weatherTemp: string | null;
  tradeDescription: string | null;
  location: string | null;
  hazards: PsiHazards;
  taskRows: PsiTaskRow[];
  voiceNotes: PsiVoiceNote[];
  status: "draft" | "submitted";
  submittedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PsiListRow {
  psi: PsiChecklist;
  project: { id: number; name: string } | null;
  creator: { id: number; firstName: string; lastName: string } | null;
  signatureCount: number;
  approvalCount: number;
}

export interface PsiSignature {
  id: number;
  userId: number;
  signatureUrl: string;
  signedAt: string;
  firstName: string | null;
  lastName: string | null;
}

export interface PsiApproval {
  id: number;
  userId: number;
  signatureUrl: string | null;
  approvedAt: string;
  firstName: string | null;
  lastName: string | null;
}

export interface PsiChecklistDetail {
  psi: PsiChecklist;
  project: { id: number; name: string } | null;
  creator: { id: number; firstName: string; lastName: string } | null;
  signatures: PsiSignature[];
  approvals: PsiApproval[];
}
