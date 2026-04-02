import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import pool from "../config/db.js";
import dotenv from "dotenv";

dotenv.config();

if (!process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET missing");
}

/* =====================================================
   REGISTER
===================================================== */

export const signup = async (req, res) => {
  try {
    let { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        status: "error",
        message: "Invalid input"
      });
    }

    email = email.toLowerCase().trim();

    const existingUser = await pool.query(
      "SELECT id FROM users WHERE email = $1",
      [email]
    );

    if (existingUser.rows.length > 0) {
      return res.status(400).json({
        status: "error",
        message: "User already exists"
      });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const newUser = await pool.query(
      `INSERT INTO users (email, password_hash)
       VALUES ($1, $2)
       RETURNING id, email`,
      [email, hashedPassword]
    );

    res.status(201).json({
      status: "success",
      user: newUser.rows[0]
    });

  } catch (err) {
    console.error("Signup Error:", err);
    res.status(500).json({
      status: "error",
      message: "Server error"
    });
  }
};


/* =====================================================
   LOGIN
===================================================== */

export const login = async (req, res) => {
  try {
    let { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        status: "error",
        message: "Invalid credentials"
      });
    }

    email = email.toLowerCase().trim();

    const result = await pool.query(
      "SELECT id, email, password_hash FROM users WHERE email=$1",
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        status: "error",
        message: "Invalid credentials"
      });
    }

    const user = result.rows[0];

    const validPassword = await bcrypt.compare(
      password,
      user.password_hash
    );

    if (!validPassword) {
      return res.status(401).json({
        status: "error",
        message: "Invalid credentials"
      });
    }

    const token = jwt.sign(
      { id: user.id },
      process.env.JWT_SECRET,
      { expiresIn: "24h" }
    );

    res.json({
      status: "success",
      token,
      user: {
        id: user.id,
        email: user.email
      }
    });

  } catch (err) {
    console.error("Login Error:", err);

    res.status(500).json({
      status: "error",
      message: "Server error"
    });
  }
};