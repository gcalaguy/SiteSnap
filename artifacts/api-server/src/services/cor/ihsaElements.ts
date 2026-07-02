// ── IHSA Element catalogue (19 elements, Ontario COR ICI) ────────────────────
//
// Single source of truth for the 19 IHSA COR elements. Previously duplicated
// (with diverging labels) across auditPackageBuilder.ts and shadowAuditor.ts.
//
// `name` is the full IHSA element name (used in the audit package export).
// `shortName` is the abbreviated label shadowAuditor.ts displays in the
// predicted-score UI, kept distinct so consolidating the data didn't change
// what either caller renders.

export const IHSA_ELEMENTS = [
  { key: "element_1",  num: "01", name: "Management Leadership & Commitment",          shortName: "Management Leadership",          folder: "01_Management_Leadership" },
  { key: "element_2",  num: "02", name: "Hazard Identification, Assessment & Control", shortName: "Hazard ID & Assessment",         folder: "02_Hazard_ID_Assessment" },
  { key: "element_3",  num: "03", name: "Hazard Control Measures",                     shortName: "Hazard Control",                 folder: "03_Hazard_Control" },
  { key: "element_4",  num: "04", name: "Ongoing Inspections",                         shortName: "Ongoing Inspections",            folder: "04_Ongoing_Inspections" },
  { key: "element_5",  num: "05", name: "Qualifications, Orientations & Training",     shortName: "Qualifications & Training",      folder: "05_Training_Qualifications" },
  { key: "element_6",  num: "06", name: "Emergency Response",                          shortName: "Emergency Response",             folder: "06_Emergency_Response" },
  { key: "element_7",  num: "07", name: "Incident Reporting & Investigation",          shortName: "Incident Reporting",             folder: "07_Incident_Reporting" },
  { key: "element_8",  num: "08", name: "Program Administration",                      shortName: "Program Administration",         folder: "08_Program_Administration" },
  { key: "element_9",  num: "09", name: "Worker Participation",                        shortName: "Worker Participation",           folder: "09_Worker_Participation" },
  { key: "element_10", num: "10", name: "Workplace Housekeeping",                      shortName: "Workplace Housekeeping",         folder: "10_Workplace_Housekeeping" },
  { key: "element_11", num: "11", name: "Environmental Protection",                    shortName: "Environmental Protection",       folder: "11_Environmental_Protection" },
  { key: "element_12", num: "12", name: "Safety Equipment & First Aid",                shortName: "Safety Equipment & First Aid",   folder: "12_Safety_Equipment_First_Aid" },
  { key: "element_13", num: "13", name: "Fire Safety & Fire Extinguishers",            shortName: "Fire Safety",                    folder: "13_Fire_Safety" },
  { key: "element_14", num: "14", name: "WHMIS & Controlled Products",                 shortName: "WHMIS & Controlled Products",    folder: "14_WHMIS" },
  { key: "element_15", num: "15", name: "Contractor Management",                       shortName: "Contractor Management",          folder: "15_Contractor_Management" },
  { key: "element_16", num: "16", name: "Medical Management",                          shortName: "Medical Management",             folder: "16_Medical_Management" },
  { key: "element_17", num: "17", name: "Joint Health & Safety Committee",             shortName: "Joint Health & Safety Committee", folder: "17_Joint_Health_Safety_Committee" },
  { key: "element_18", num: "18", name: "Occupational Health",                         shortName: "Occupational Health",            folder: "18_Occupational_Health" },
  { key: "element_19", num: "19", name: "Records & Statistics",                        shortName: "Records & Statistics",           folder: "19_Records_Statistics" },
] as const;

export const ELEMENT_SHORT_NAMES: Record<string, string> = Object.fromEntries(
  IHSA_ELEMENTS.map((el) => [el.key, el.shortName]),
);

export const ALL_ELEMENT_KEYS: string[] = IHSA_ELEMENTS.map((el) => el.key);
