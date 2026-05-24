import { Router } from "express";
import { requireAuth, requireSuperAdmin } from "../lib/auth";

const router = Router();
const guard = [requireAuth, requireSuperAdmin];

interface AuditLogEntry {
  id: number;
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
    timestamp: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
    userName: "Gigi Construction",
    userRole: "foreman",
    action: "Safety document uploaded",
    projectName: "Maple Ridge Residence",
    ipAddress: "192.168.1.42",
  },
  {
    id: 2,
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
    userName: "Marcus Chen",
    userRole: "owner",
    action: "Invoice approved",
    projectName: "Downtown Condo Tower",
    ipAddress: "203.45.112.8",
  },
  {
    id: 3,
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),
    userName: "Sarah O'Brien",
    userRole: "worker",
    action: "Daily report submitted",
    projectName: "North Shore Bridge",
    ipAddress: "10.0.0.19",
  },
  {
    id: 4,
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
    userName: "Ahmad Hassan",
    userRole: "foreman",
    action: "RFI response submitted",
    projectName: "Downtown Condo Tower",
    ipAddress: "198.51.100.7",
  },
  {
    id: 5,
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(),
    userName: "Jessica Li",
    userRole: "owner",
    action: "Photo uploaded to gallery",
    projectName: "Maple Ridge Residence",
    ipAddress: "172.16.0.33",
  },
];

// GET /api/audit-logs — read-only audit log viewer (super-admin only)
router.get("/audit-logs", ...guard, async (_req, res) => {
  const sorted = [...MOCK_AUDIT_LOGS].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );
  res.json(sorted);
});

export default router;
