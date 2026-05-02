import { Router } from "express";
import {
  getAllNotifications,
  getNotificationById,
  createNotification,
  markAsRead,
  deleteNotification,
  getPriorityNotifications,
} from "../controllers/notification.controller";

const router = Router();

router.get("/", getAllNotifications);
router.get("/priority", getPriorityNotifications);
router.get("/:id", getNotificationById);
router.post("/", createNotification);
router.patch("/:id/read", markAsRead);
router.delete("/:id", deleteNotification);

export default router;
