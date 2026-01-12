const sqlite3 = require("sqlite3").verbose();
const db = new sqlite3.Database("hall_matrix.db");

// USERS TABLE
db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    username TEXT UNIQUE,
    password TEXT,
    role TEXT CHECK(role IN ('admin','tutor'))
)`);

// STUDENTS TABLE
db.run(`CREATE TABLE IF NOT EXISTS students (
    regno TEXT PRIMARY KEY,
    dept TEXT,
    subject_code TEXT
)`);

// SUBJECTS TABLE
db.run(`CREATE TABLE IF NOT EXISTS subjects (
    code TEXT PRIMARY KEY,
    name TEXT
)`);

// HALLS TABLE
db.run(`CREATE TABLE IF NOT EXISTS halls (
    hall_no TEXT PRIMARY KEY,
    capacity INTEGER
)`);

// INVIGILATORS TABLE
db.run(`CREATE TABLE IF NOT EXISTS invigilators (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    hall_no TEXT,
    date TEXT,
    session TEXT
)`);

console.log("Database & tables created successfully.");
db.close();
