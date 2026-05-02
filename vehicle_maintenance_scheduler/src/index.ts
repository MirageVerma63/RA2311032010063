import axios from "axios";
import dotenv from "dotenv";
import { setToken, Log } from "logging_middleware";

dotenv.config();

const BASE_URL = process.env.BASE_URL || "http://20.207.122.201";

interface Depot {
  ID: number;
  MechanicHours: number;
}

interface Vehicle {
  TaskID: string;
  Duration: number;
  Impact: number;
}

interface ScheduleResult {
  depotID: number;
  mechanicHours: number;
  selectedTasks: Vehicle[];
  totalImpact: number;
  totalDuration: number;
}

// gets auth token from the test server
async function getAuthToken(): Promise<string> {
  await Log("backend", "info", "auth", "Requesting auth token for vehicle scheduler");

  const response = await axios.post(`${BASE_URL}/evaluation-service/auth`, {
    email: process.env.EMAIL,
    name: process.env.NAME,
    rollNo: process.env.ROLL_NO,
    accessCode: process.env.ACCESS_CODE,
    clientID: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
  });

  const token = response.data.access_token;
  if (!token) throw new Error("No token in auth response");

  await Log("backend", "info", "auth", "Auth token received successfully");
  return token;
}

// fetches all depots from the test server
async function fetchDepots(token: string): Promise<Depot[]> {
  await Log("backend", "info", "service", "Fetching depots from test server");

  const response = await axios.get(`${BASE_URL}/evaluation-service/depots`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  const depots: Depot[] = response.data.depots;
  await Log("backend", "info", "service", `Fetched ${depots.length} depots`);
  return depots;
}

// fetches all vehicles from the test server
async function fetchVehicles(token: string): Promise<Vehicle[]> {
  await Log("backend", "info", "service", "Fetching vehicles from test server");

  const response = await axios.get(`${BASE_URL}/evaluation-service/vehicles`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  const vehicles: Vehicle[] = response.data.vehicles;
  await Log("backend", "info", "service", `Fetched ${vehicles.length} vehicles`);
  return vehicles;
}

// 0/1 knapsack algorithm
// picks the best combination of tasks that fits within mechanic hours
// and gives the highest total impact score
function knapsack(vehicles: Vehicle[], maxHours: number): Vehicle[] {
  const n = vehicles.length;

  // dp[i][w] = best impact using first i tasks with w hours available
  const dp: number[][] = Array.from({ length: n + 1 }, () =>
    new Array(maxHours + 1).fill(0)
  );

  for (let i = 1; i <= n; i++) {
    const task = vehicles[i - 1];
    for (let w = 0; w <= maxHours; w++) {
      // option 1: skip this task
      dp[i][w] = dp[i - 1][w];

      // option 2: include this task if it fits
      if (task.Duration <= w) {
        const withTask = dp[i - 1][w - task.Duration] + task.Impact;
        if (withTask > dp[i][w]) {
          dp[i][w] = withTask;
        }
      }
    }
  }

  // trace back to find which tasks were selected
  const selected: Vehicle[] = [];
  let w = maxHours;
  for (let i = n; i >= 1; i--) {
    if (dp[i][w] !== dp[i - 1][w]) {
      selected.push(vehicles[i - 1]);
      w -= vehicles[i - 1].Duration;
    }
  }

  return selected;
}

// runs the scheduler for each depot
function scheduleForDepot(depot: Depot, vehicles: Vehicle[]): ScheduleResult {
  const selected = knapsack(vehicles, depot.MechanicHours);

  const totalImpact = selected.reduce((sum, v) => sum + v.Impact, 0);
  const totalDuration = selected.reduce((sum, v) => sum + v.Duration, 0);

  return {
    depotID: depot.ID,
    mechanicHours: depot.MechanicHours,
    selectedTasks: selected,
    totalImpact,
    totalDuration,
  };
}

async function main() {
  try {
    await Log("backend", "info", "service", "Vehicle maintenance scheduler starting");

    const token = await getAuthToken();
    setToken(token);

    const [depots, vehicles] = await Promise.all([
      fetchDepots(token),
      fetchVehicles(token),
    ]);

    await Log("backend", "info", "service", `Running scheduler for ${depots.length} depots with ${vehicles.length} total vehicles`);

    const results: ScheduleResult[] = [];

    for (const depot of depots) {
      await Log("backend", "debug", "service", `Scheduling for depot ${depot.ID} with ${depot.MechanicHours} mechanic hours`);

      const result = scheduleForDepot(depot, vehicles);
      results.push(result);

      console.log(`\n--- Depot ${depot.ID} (Budget: ${depot.MechanicHours} hours) ---`);
      console.log(`Tasks selected: ${result.selectedTasks.length}`);
      console.log(`Total duration used: ${result.totalDuration} hours`);
      console.log(`Total impact score: ${result.totalImpact}`);
      console.log("Selected tasks:");
      result.selectedTasks.forEach((task) => {
        console.log(`  TaskID: ${task.TaskID} | Duration: ${task.Duration}h | Impact: ${task.Impact}`);
      });

      await Log("backend", "info", "service", `Depot ${depot.ID} scheduled: ${result.selectedTasks.length} tasks, impact=${result.totalImpact}, duration=${result.totalDuration}`);
    }

    console.log("\n===== SUMMARY =====");
    results.forEach((r) => {
      console.log(`Depot ${r.depotID}: ${r.selectedTasks.length} tasks | Impact: ${r.totalImpact} | Hours used: ${r.totalDuration}/${r.mechanicHours}`);
    });

    await Log("backend", "info", "service", "Vehicle maintenance scheduler completed successfully");
  } catch (err: any) {
    await Log("backend", "fatal", "service", `Scheduler failed: ${err?.message}`);
    console.error("Error:", err?.message);
    process.exit(1);
  }
}

main();
