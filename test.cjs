const mysql = require("mysql2");
const express = require("express");
const cors = require("cors");
require("dotenv").config();

const PORT = process.env.PORT || 5000;
const app = express();

app.use(cors());
app.use(express.json());

const connection = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: process.env.DB_PASSWORD || "",
  database: "employeedb",
});

connection.connect((error) => {
  if (error) {
    console.error("Database connection failed:", error.message);
    return;
  }

  console.log("Database connected successfully");
});

app.get("/api/users", (req, res) => {
  const query = "SELECT * FROM users";

  connection.query(query, (error, results) => {
    if (error) {
      console.error("Error fetching data:", error);

      return res.status(500).json({
        message: "Error fetching users",
        error: error.message,
      });
    }

    return res.status(200).json(results);
  });
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
