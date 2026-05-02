import dotenv from "dotenv";
dotenv.config();

export const config = {
  port: process.env.PORT || 3000,
  clientId: process.env.CLIENT_ID || "",
  clientSecret: process.env.CLIENT_SECRET || "",
  accessCode: process.env.ACCESS_CODE || "",
  rollNo: process.env.ROLL_NO || "",
  email: process.env.EMAIL || "",
  name: process.env.NAME || "",
  baseUrl: process.env.BASE_URL || "http://20.207.122.201",
};
