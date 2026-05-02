import axios from "axios";

const LOG_ENDPOINT = "http://20.207.122.201/evaluation-service/logs";

// token is set once after auth and reused for all log calls
let bearerToken: string = "";

export function setToken(token: string): void {
  bearerToken = token;
}

export type Stack = "backend" | "frontend";
export type Level = "debug" | "info" | "warn" | "error" | "fatal";

// backend-only packages
type BackendPackage =
  | "cache"
  | "controller"
  | "cron_job"
  | "db"
  | "domain"
  | "handler"
  | "repository"
  | "route"
  | "service";

// frontend-only packages
type FrontendPackage =
  | "api"
  | "component"
  | "hook"
  | "page"
  | "state"
  | "style";

// packages that work in both
type SharedPackage = "auth" | "config" | "middleware" | "utils";

export type Package = BackendPackage | FrontendPackage | SharedPackage;

export async function Log(
  stack: Stack,
  level: Level,
  pkg: Package,
  message: string
): Promise<void> {
  if (!bearerToken) {
    console.warn("[Log] No token set. Call setToken() before logging.");
    return;
  }

  try {
    await axios.post(
      LOG_ENDPOINT,
      {
        stack,
        level,
        package: pkg,
        message,
      },
      {
        headers: {
          Authorization: `Bearer ${bearerToken}`,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (err: any) {
    console.error("[Log] Failed to send log:", err?.message || err);
  }
}
