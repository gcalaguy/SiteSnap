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
import conversationsRouter from "./conversations";
import dashboardRouter from "./dashboard";
import tasksRouter from "./tasks";
import photosRouter from "./photos";
import storageRouter from "./storage";

const router: IRouter = Router();

router.use(healthRouter);
router.use(usersRouter);
router.use(companiesRouter);
router.use(invitationsRouter);
router.use(projectsRouter);
router.use("/projects/:projectId/daily-reports", dailyReportsRouter);
router.use("/projects/:projectId/cost-analyses", costAnalysesRouter);
router.use("/projects/:projectId/rfis", rfisRouter);
router.use("/projects/:projectId/tasks", tasksRouter);
router.use("/projects/:projectId/daily-reports/:reportId/photos", photosRouter);
router.use(aiRouter);
router.use(conversationsRouter);
router.use(dashboardRouter);
router.use(storageRouter);

export default router;
