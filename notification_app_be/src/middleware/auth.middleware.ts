import axios from "axios";
import { config } from "../config/config";
import { setToken, Log } from "logging_middleware";

export async function initAuth(): Promise<void> {
  try {
    await Log("backend", "info", "auth", "Requesting auth token from test server");

    const response = await axios.post(`${config.baseUrl}/evaluation-service/auth`, {
      email: config.email,
      name: config.name,
      rollNo: config.rollNo,
      accessCode: config.accessCode,
      clientID: config.clientId,
      clientSecret: config.clientSecret,
    });

    const token = response.data.access_token;

    if (!token) {
      throw new Error("Token missing in response");
    }

    setToken(token);
    await Log("backend", "info", "auth", "Token received and set successfully");
    console.log("Auth token ready");
  } catch (err: any) {
    await Log("backend", "fatal", "auth", `Auth failed: ${err?.message}`);
    console.error("Could not get auth token:", err?.message);
    process.exit(1);
  }
}
