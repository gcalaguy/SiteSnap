import { Router } from "express";
import { requireAuth, requireAuditAccess } from "../lib/auth";

const router = Router();
const guard = [requireAuth, requireAuditAccess];

interface AuditLogEntry {
  id: number;
  companyId: number;
  timestamp: string;
  userName: string;
  userRole: string;
  action: string;
  projectName: string;
  ipAddress: string;
}

const MOCK_AUDIT_LOGS: AuditLogEntry[] = [
  {
    id: 1,
    companyId: 1,
    timestamp: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
    userName: "Gigi Construction",
    userRole: "foreman",
    action: "Safety document uploaded",
    projectName: "Maple Ridge Residence",
    ipAddress: "192.168.1.42",
  },
  {
    id: 2,
    companyId: 1,
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
    userName: "Marcus Chen",
    userRole: "owner",
    action: "Invoice approved",
    projectName: "Downtown Condo Tower",
    ipAddress: "203.45.112.8",
  },
  {
    id: 3,
    companyId: 2,
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),
    userName: "Sarah O'Brien",
    userRole: "worker",
    action: "Daily report submitted",
    projectName: "North Shore Bridge",
    ipAddress: "10.0.0.19",
  },
  {
    id: 4,
    companyId: 2,
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
    userName: "Ahmad Hassan",
    userRole: "foreman",
    action: "RFI response submitted",
    projectName: "Downtown Condo Tower",
    ipAddress: "198.51.100.7",
  },
  {
    id: 5,
    companyId: 1,
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(),
    userName: "Jessica Li",
    userRole: "owner",
    action: "Photo uploaded to gallery",
    projectName: "Maple Ridge Residence",
    ipAddress: "172.16.0.33",
  },
];

// GET /api/audit-logs — read-only audit log viewer
// Super admins see all logs; Enterprise tenant owners see only their own company’s logs.
router.get("/audit-logs", ...guard, async (req, res) => {
  const isSuperAdmin = req.systemRole === "super_admin";
  const companyId = req.companyId;

  let logs = MOCK_AUDIT_LOGS;
  if (!isSuperAdmin && companyId != null) {
    logs = logs.filter((log) => log.companyId === companyId);
  }

  const sorted = [...logs].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );
  res.json(sorted);
});

export default router;
