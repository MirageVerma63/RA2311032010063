import { Notification } from "../services/notification.service";

// using in-memory store - can be swapped with postgres/mysql later
const database: Notification[] = [];

export function getDB(): Notification[] {
  return database;
}
