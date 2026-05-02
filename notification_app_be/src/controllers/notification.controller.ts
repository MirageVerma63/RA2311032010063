import { Request, Response } from "express";
import { Log } from "logging_middleware";
import {
  fetchAll,
  fetchById,
  insertNotification,
  markNotificationRead,
  removeNotification,
  fetchTopPriority,
} from "../services/notification.service";

export async function getAllNotifications(req: Request, res: Response) {
  try {
    const studentId = req.query.studentId as string | undefined;
    await Log("backend", "info", "controller", `GET /notifications called${studentId ? ` for student ${studentId}` : ""}`);

    const data = await fetchAll(studentId);
    res.status(200).json({ notifications: data });
  } catch (err: any) {
    await Log("backend", "error", "controller", `Failed to get notifications: ${err?.message}`);
    res.status(500).json({ error: "Something went wrong" });
  }
}

export async function getNotificationById(req: Request, res: Response) {
  try {
    const { id } = req.params;
    await Log("backend", "info", "controller", `GET /notifications/${id}`);

    const notif = await fetchById(id);
    if (!notif) {
      await Log("backend", "warn", "controller", `Notification ${id} not found`);
      res.status(404).json({ error: "Notification not found" });
      return;
    }

    res.status(200).json(notif);
  } catch (err: any) {
    await Log("backend", "error", "controller", `Error fetching notification by id: ${err?.message}`);
    res.status(500).json({ error: "Something went wrong" });
  }
}

export async function createNotification(req: Request, res: Response) {
  try {
    const { studentId, title, message, type } = req.body;
    await Log("backend", "info", "controller", `POST /notifications - type: ${type} for student: ${studentId}`);

    if (!studentId || !title || !message || !type) {
      await Log("backend", "warn", "controller", "Missing required fields in create notification request");
      res.status(400).json({ error: "studentId, title, message and type are required" });
      return;
    }

    const validTypes = ["Placement", "Event", "Result"];
    if (!validTypes.includes(type)) {
      res.status(400).json({ error: "type must be Placement, Event or Result" });
      return;
    }

    const newNotif = await insertNotification({ studentId, title, message, type });
    res.status(201).json(newNotif);
  } catch (err: any) {
    await Log("backend", "error", "controller", `Error creating notification: ${err?.message}`);
    res.status(500).json({ error: "Something went wrong" });
  }
}

export async function markAsRead(req: Request, res: Response) {
  try {
    const { id } = req.params;
    await Log("backend", "info", "controller", `PATCH /notifications/${id}/read`);

    const updated = await markNotificationRead(id);
    if (!updated) {
      res.status(404).json({ error: "Notification not found" });
      return;
    }

    res.status(200).json(updated);
  } catch (err: any) {
    await Log("backend", "error", "controller", `Error marking notification as read: ${err?.message}`);
    res.status(500).json({ error: "Something went wrong" });
  }
}

export async function deleteNotification(req: Request, res: Response) {
  try {
    const { id } = req.params;
    await Log("backend", "info", "controller", `DELETE /notifications/${id}`);

    const deleted = await removeNotification(id);
    if (!deleted) {
      res.status(404).json({ error: "Notification not found" });
      return;
    }

    res.status(200).json({ message: "Deleted successfully" });
  } catch (err: any) {
    await Log("backend", "error", "controller", `Error deleting notification: ${err?.message}`);
    res.status(500).json({ error: "Something went wrong" });
  }
}

export async function getPriorityNotifications(req: Request, res: Response) {
  try {
    const n = parseInt(req.query.n as string) || 10;
    await Log("backend", "info", "controller", `GET /notifications/priority - top ${n} requested`);

    const data = await fetchTopPriority(n);
    res.status(200).json({ notifications: data });
  } catch (err: any) {
    await Log("backend", "error", "controller", `Error fetching priority notifications: ${err?.message}`);
    res.status(500).json({ error: "Something went wrong" });
  }
}
