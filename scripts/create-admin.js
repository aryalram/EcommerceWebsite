import "dotenv/config";
import { randomBytes, scrypt } from "node:crypto";
import process, { stdin, stdout } from "node:process";
import { createInterface } from "node:readline/promises";
import mysql from "mysql2/promise";

function ask(question) {
  const readline = createInterface({ input: stdin, output: stdout });
  return readline.question(question).finally(() => readline.close());
}

function askHidden(question) {
  if (!stdin.isTTY || typeof stdin.setRawMode !== "function") {
    throw new Error("Run this command in an interactive terminal to enter a password safely.");
  }

  return new Promise((resolve, reject) => {
    let password = "";
    stdout.write(question);
    stdin.setEncoding("utf8");
    stdin.setRawMode(true);
    stdin.resume();

    function cleanup() {
      stdin.off("data", onData);
      stdin.setRawMode(false);
      stdin.pause();
    }

    function onData(input) {
      for (const character of input) {
        if (character === "\u0003") {
          cleanup();
          stdout.write("\n");
          reject(new Error("Admin setup cancelled."));
          return;
        }
        if (character === "\r" || character === "\n") {
          cleanup();
          stdout.write("\n");
          resolve(password);
          return;
        }
        if (character === "\u0008" || character === "\u007f") {
          password = [...password].slice(0, -1).join("");
        } else {
          password += character;
        }
      }
    }

    stdin.on("data", onData);
  });
}

function hashPassword(password, salt) {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 64, (error, key) => {
      if (error) reject(error);
      else resolve(key.toString("hex"));
    });
  });
}

async function createAdmin() {
  const email = (await ask("Admin email: ")).trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Enter a valid email address.");
  }

  const password = await askHidden("Admin password (input hidden): ");
  if (password.length < 12) {
    throw new Error("Choose a password with at least 12 characters.");
  }
  const confirmation = await askHidden("Confirm password: ");
  if (password !== confirmation) {
    throw new Error("Passwords do not match.");
  }

  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "ecomerce",
  });

  try {
    const [existing] = await connection.execute(
      "SELECT id FROM admin_users WHERE email = ? LIMIT 1",
      [email],
    );
    if (existing.length) {
      throw new Error("An account with that email already exists. No changes were made.");
    }

    const salt = randomBytes(16).toString("hex");
    const passwordHash = await hashPassword(password, salt);
    await connection.execute(
      "INSERT INTO admin_users (email, password_hash, role, is_active) VALUES (?, ?, 'admin', TRUE)",
      [email, `scrypt$${salt}$${passwordHash}`],
    );
    console.log(`Admin account created for ${email}. You can now sign in at /admin.`);
  } finally {
    await connection.end();
  }
}

createAdmin().catch((error) => {
  console.error(`Admin setup failed: ${error.message}`);
  process.exitCode = 1;
});
