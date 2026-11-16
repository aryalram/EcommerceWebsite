const mysql = require("mysql2");
const cors = require("cors");
const express = require("express");
require("dotenv").config();

const app = express();

const PORT = process.env.PORT || 5000;
app.use(cors());
app.use(express.json());

const con = mysql.createConnection({
  host: "localhost", /// your host name here
  user: "root", /// your username here
  password: process.env.DB_PASSWORD || "",
  database: "employeedb", //// your database name here
});

con.connect((error) => {
  if (error) {
    console.log("error in database Connection");
  } else {
    console.log("database connected success");
  }
});

app.get("/api", (_req, res) => res.redirect(301, "/api/users"));
app.get("/api/old-users", (_req, res) => res.redirect(302, "/api/users"));

app.listen(PORT, () => {
  console.log(`server runing at port ${PORT}`);
});

app.get("/api/users", (req, res) => {
  const query = `SELECT * FROM users`;

  con.query(query, (err, results) => {
    if (err) {
      console.log("error in fetching data ");
      return res.status(502).json({ message: "Database unavailable" });
    } else {
      res.status(200).json(results);
    }
  });
});

app.post("/api/users", (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res
      .status(400)
      .json({ message: "Username and password are required" });
  }

  const query = `SELECT * FROM users WHERE username = ? AND password = ?`;

  con.query(query, [username, password], (error, results) => {
    if (error) {
      console.error("Error occurred:", error);
      return res
        .status(500)
        .json({ success: false, message: "Database error" });
    }

    if (results.length > 0) {
      // Login success
      res
        .status(200)
        .json({ success: true, message: "Login successful", user: results[0] });
    } else {
      // Login failed
      res
        .status(401)
        .json({ success: false, message: "Invalid username or password" });
    }
  });
});
/// for insert

app.post("/api/register", (req, res) => {
  const { username, email, password } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({ message: "All fields are required" });
  }

  const query = `INSERT INTO users (username, email, password) VALUES (?, ?, ?)`;

  con.query(query, [username, email, password], (error, results) => {
    if (error) {
      console.error("Error inserting data:", error);
      return res
        .status(500)
        .json({ message: "Database error during insertion" });
    }

    if (results.affectedRows > 0) {
      console.log("User inserted successfully");
      res.status(201).json({
        message: "User created successfully",
        insertedId: results.insertId,
      });
    } else {
      console.log("Failed to insert user");
      res.status(400).json({ message: "Failed to insert user" });
    }
  });
});

app.get("/api/admin", (req, res) => {
  if (!req.headers.authorization) {
    return res.status(401).json({ message: "Authorization required" });
  }
  if (req.headers.authorization !== `Bearer ${process.env.ADMIN_KEY}`) {
    return res.status(403).json({ message: "Access denied" });
  }
  res.status(200).json({ message: "Admin access granted" });
});

app.post("/api/payment", (req, res) => {
  if (req.body.method === "unsupported") {
    return res.status(501).json({ message: "Payment method not implemented" });
  }
  if (!req.body.method) {
    return res.status(402).json({ message: "Payment required" });
  }
  res.status(200).json({ message: "Payment accepted" });
});

app.use("/api", (_req, res) => {
  res.status(404).json({ message: "Route not found" });
});
