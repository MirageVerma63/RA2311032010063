import { Log } from "logging_middleware";
import { getDB } from "../db/db";

export interface Notification {
  id: string;
  studentId: string;
  title: string;
  message: string;
  type: "Placement" | "Event" | "Result";
  isRead: boolean;
  createdAt: string;
}

// weight map for priority sorting - placement is most important
const typeWeight: Record<string, number> = {
  Placement: 3,
  Result: 2,
  Event: 1,
};

export async function fetchAll(studentId?: string): Promise<Notification[]> {
  await Log("backend", "debug", "service", `Fetching notifications${studentId ? ` for student ${studentId}` : ""}`);
  const db = getDB();

  if (studentId) {
    return db.filter((n) => n.studentId === studentId);
  }
  return db;
}

export async function fetchById(id: string): Promise<Notification | null> {
  await Log("backend", "debug", "service", `Looking up notification with id ${id}`);
  const db = getDB();
  return db.find((n) => n.id === id) || null;
}

export async function insertNotification(data: Omit<Notification, "id" | "createdAt" | "isRead">): Promise<Notification> {
  await Log("backend", "info", "service", `Creating new ${data.type} notification for student ${data.studentId}`);
  const db = getDB();

  const newNotif: Notification = {
    id: crypto.randomUUID(),
    ...data,
    isRead: false,
    createdAt: new Date().toISOString(),
  };

  db.push(newNotif);
  await Log("backend", "info", "service", `Notification saved with id ${newNotif.id}`);
  return newNotif;
}

export async function markNotificationRead(id: string): Promise<Notification | null> {
  await Log("backend", "info", "service", `Marking notification ${id} as read`);
  const db = getDB();
  const notif = db.find((n) => n.id === id);

  if (!notif) {
    await Log("backend", "warn", "service", `Notification ${id} not found for mark-read`);
    return null;
  }

  notif.isRead = true;
  return notif;
}

export async function removeNotification(id: string): Promise<boolean> {
  await Log("backend", "info", "service", `Deleting notification ${id}`);
  const db = getDB();
  const index = db.findIndex((n) => n.id === id);

  if (index === -1) {
    await Log("backend", "warn", "service", `Notification ${id} not found for deletion`);
    return false;
  }

  db.splice(index, 1);
  return true;
}

// returns top n notifications sorted by type weight + recency
export async function fetchTopPriority(n: number = 10): Promise<Notification[]> {
  await Log("backend", "info", "service", `Fetching top ${n} priority notifications`);
  const db = getDB();

  const unread = db.filter((notif) => !notif.isRead);

  const sorted = unread.sort((a, b) => {
    const weightDiff = (typeWeight[b.type] || 0) - (typeWeight[a.type] || 0);
    if (weightDiff !== 0) return weightDiff;

    // same weight? sort by most recent
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  return sorted.slice(0, n);
}
