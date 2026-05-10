import type { Request } from "express";

export interface ClientInfo {
  ip: string;
  userAgent: string;
  signedAt: Date;
}

export function getClientInfo(req: Request): ClientInfo {
  const ip = (req.ip || req.socket.remoteAddress || "unknown").toString();
  const ua = (req.headers["user-agent"] ?? "unknown").toString().slice(0, 500);
  return { ip, userAgent: ua, signedAt: new Date() };
}
