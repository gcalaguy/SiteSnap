import { Router, type IRouter } from "express";
import healthRouter from "./health";
import usersRouter from "./users";
import companiesRouter from "./companies";
import invitationsRouter from "./invitations";
import projectsRouter from "./projects";
import dailyReportsRouter from "./dailyReports";
import costAnalysesRouter from "./costAnalyses";
import rfisRouter from "./rfis";
import aiRouter from "./ai";
import dashboardRouter from "./dashboard";

const router: IRouter = Router();

router.use(healthRouter);
router.use(usersRouter);
router.use(companiesRouter);
router.use(invitationsRouter);
router.use(projectsRouter);
router.use("/projects/:projectId/daily-reports", dailyReportsRouter);
router.use("/projects/:projectId/cost-analyses", costAnalysesRouter);
router.use("/projects/:projectId/rfis", rfisRouter);
router.use(aiRouter);
router.use(dashboardRouter);

export default router;
