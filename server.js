console.log("✅ server.js loaded");

/* =======================
   1. IMPORTS
======================= */
const {
  allocateRule1,
  allocateRule2,
  getSeatLabel,
} = require("./utils/allocationLogic");

const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const session = require("express-session");
const multer = require("multer");
const fs = require("fs");
const XLSX = require("xlsx");

const PDFDocument = require("pdfkit");

/* =======================
   2. APP & DB
======================= */
const app = express();
const db = new sqlite3.Database(path.join(__dirname, "hall_matrix.db"));

app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));
app.set("view engine", "ejs");

/* =======================
   3. SESSION
======================= */
app.use(
  session({
    secret: "hallmatrix_secret",
    resave: false,
    saveUninitialized: false,
  })
);

/* =======================
   4. MULTER
======================= */
if (!fs.existsSync("uploads")) fs.mkdirSync("uploads");
const upload = multer({ dest: "uploads/" });

/* =======================
   5. AUTH MIDDLEWARE
======================= */
function requireLogin(req, res, next) {
  if (!req.session.user) return res.redirect("/login");
  next();
}


/* =======================
   6. DATABASE TABLES
======================= */
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    username TEXT UNIQUE,
    password TEXT,
    role TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS students (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    regno TEXT,
    dept TEXT,
    subject_code TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS halls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    hall_no TEXT UNIQUE,
    capacity INTEGER,
    block TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS subjects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE,
    name TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS invigilators (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    dept TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS allocations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subject_code TEXT,
    hall_no TEXT,
    reg_no TEXT,
    exam_date TEXT,
    session TEXT,
    invigilator TEXT
  )`);
});

/* =======================
   7. AUTH ROUTES
======================= */
app.get("/", (req, res) => res.redirect("/login"));

app.get("/login", (req, res) => res.render("login", { message: "" }));

app.post("/login", (req, res) => {
  const { username, password } = req.body;
  db.get(
    "SELECT * FROM users WHERE username=? AND password=?",
    [username, password],
    (err, user) => {
      if (user) {
        req.session.user = user;
        res.redirect("/dashboard");
      } else {
        res.render("login", { message: "Invalid credentials" });
      }
    }
  );
});

app.get("/register", (req, res) => res.render("register", { message: "" }));

app.post("/register", (req, res) => {
  const { name, username, password, role } = req.body;
  db.run(
    "INSERT INTO users VALUES (NULL,?,?,?,?)",
    [name, username, password, role],
    (err) => {
      if (err) return res.render("register", { message: "Username exists" });
      res.redirect("/login");
    }
  );
});

app.get("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/login"));
});

/* =======================
   8. DASHBOARD
======================= */
app.get("/dashboard", requireLogin, (req, res) => {
  res.render("dashboard", {
    user: req.session.user,
    currentPage: "dashboard",
  });
});

/* =======================
   9. STUDENTS
======================= */
app.get("/students", requireLogin, (req, res) => {
  db.all("SELECT * FROM students", (err, rows) => {
    if (err) return res.send("Database error");
    res.render("students", {
      students: rows,
      currentPage: "students",
    });
  });
});

app.post("/students/add", requireLogin, (req, res) => {
  const { regno, dept, subject_code } = req.body;
  db.run(
    "INSERT INTO students (regno, dept, subject_code) VALUES (?,?,?)",
    [regno, dept, subject_code],
    () => res.redirect("/students")
  );
});

app.post(
  "/students/upload",
  requireLogin,
  upload.single("excelFile"),
  (req, res) => {
    const workbook = XLSX.readFile(req.file.path);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(sheet);

    const stmt = db.prepare(
      "INSERT INTO students (regno, dept, subject_code) VALUES (?,?,?)"
    );

    data.forEach((r) => {
      if (r.regno && r.dept && r.subject_code) {
        stmt.run(r.regno, r.dept, r.subject_code);
      }
    });

    stmt.finalize();
    fs.unlinkSync(req.file.path);
    res.redirect("/students");
  }
);

app.post("/students/delete/:id", requireLogin, (req, res) => {
  db.run("DELETE FROM students WHERE id=?", [req.params.id], () =>
    res.redirect("/students")
  );
});

/* =======================
   10. HALLS
======================= */
app.get("/halls", requireLogin, (req, res) => {
  db.all("SELECT * FROM halls", (err, rows) => {
    res.render("view_halls", {
      halls: rows,
      currentPage: "halls",
    });
  });
});

app.post("/halls/add", requireLogin, (req, res) => {
  const { hall_no, capacity, block } = req.body;
  db.run(
    "INSERT INTO halls (hall_no, capacity, block) VALUES (?,?,?)",
    [hall_no, capacity, block],
    () => res.redirect("/halls")
  );
});

app.post("/halls/delete/:id", requireLogin, (req, res) => {
  db.run("DELETE FROM halls WHERE id=?", [req.params.id], () =>
    res.redirect("/halls")
  );
});

/* =======================
   11. SUBJECTS
======================= */
app.get("/subjects", requireLogin, (req, res) => {
  db.all("SELECT * FROM subjects", (err, rows) => {
    res.render("view_subjects", {
      subjects: rows,
      currentPage: "subjects",
    });
  });
});

app.post("/subjects/add", requireLogin, (req, res) => {
  const { code, name } = req.body;
  db.run("INSERT INTO subjects (code, name) VALUES (?,?)", [code, name], () =>
    res.redirect("/subjects")
  );
});

app.post("/subjects/delete/:id", requireLogin, (req, res) => {
  db.run("DELETE FROM subjects WHERE id=?", [req.params.id], () =>
    res.redirect("/subjects")
  );
});

/* =======================
   12. INVIGILATORS
======================= */
app.get("/invigilators", requireLogin, (req, res) => {
  db.all("SELECT * FROM invigilators", (err, rows) => {
    res.render("view_invigilators", {
      invigilators: rows,
      currentPage: "invigilators",
    });
  });
});

app.post("/invigilators/add", requireLogin, (req, res) => {
  const { name, dept } = req.body;
  db.run(
    "INSERT INTO invigilators (name, dept) VALUES (?,?)",
    [name, dept],
    () => res.redirect("/invigilators")
  );
});

app.post("/invigilators/delete/:id", requireLogin, (req, res) => {
  db.run("DELETE FROM invigilators WHERE id=?", [req.params.id], () =>
    res.redirect("/invigilators")
  );
});

/* =======================
   13. ALLOCATION
======================= */
app.get("/allocation", requireLogin, (req, res) => {
  res.render("allocation", {
    user: req.session.user,
    currentPage: "allocation",
  });
});

app.post("/allocation/generate", requireLogin, (req, res) => {
  const { subject_codes, exam_date, session } = req.body;
  if (!subject_codes) return res.send("Subject codes required");

  const codes = subject_codes.split(",").map((c) => c.trim());

  db.all(
    `SELECT * FROM students WHERE subject_code IN (${codes
      .map(() => "?")
      .join(",")})`,
    codes,
    (err, students) => {
      if (err || students.length === 0) return res.send("No students found");

      db.all("SELECT * FROM halls", (err, halls) => {
        if (err || halls.length === 0) return res.send("No halls found");

        db.all("SELECT * FROM invigilators", (err, invs) => {
          if (err) return res.send("Invigilator error");

          let allocations = [];
          let studentIndex = 0;

          halls.forEach((hall, hIndex) => {
            const hallStudents = students.slice(
              studentIndex,
              studentIndex + hall.capacity
            );

            if (hallStudents.length === 0) return;

            // 🔥 APPLY RULE-1 → FALLBACK TO RULE-2
            const grid =
              allocateRule1(hallStudents, hall.capacity) ||
              allocateRule2(hallStudents, hall.capacity);

            const inv = invs[hIndex % invs.length]?.name || "NA";

            grid.forEach((rowArr, r) => {
              rowArr.forEach((student, c) => {
                if (!student) return;

                allocations.push({
                  hall_no: hall.hall_no,
                  seat: getSeatLabel(r * 4 + c),
                  regno: student.regno,
                  dept: student.dept,
                  subject_code: student.subject_code,
                  exam_date,
                  session,
                  invigilator: inv,
                });
              });
            });

            studentIndex += hall.capacity;
          });

          req.session.preview = allocations;
          res.redirect("/allocation/preview");
        });
      });
    }
  );
});


app.get("/allocation/view", requireLogin, (req, res) => {
  db.all("SELECT * FROM allocations", (err, rows) => {
    res.render("view_allocation", { allocations: rows });
  });
});
app.get("/allocation/preview", requireLogin, (req, res) => {
  if (!req.session.preview || req.session.preview.length === 0) {
    return res.send("No allocation preview found");
  }

  res.render("allocation_preview", {
    preview: req.session.preview,
    date: req.session.preview[0].exam_date,
    session: req.session.preview[0].session,
  });
});



app.get("/allocation/pdf", requireLogin, (req, res) => {
  if (!req.session.preview) {
    return res.send("No allocation preview found");
  }

  const doc = new PDFDocument({ margin: 30 });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", "inline; filename=allocation.pdf");

  doc.pipe(res);

  let currentHall = "";

  req.session.preview.forEach((p) => {
    if (currentHall !== p.hall_no) {
      currentHall = p.hall_no;
      doc.addPage();
      doc.fontSize(16).text(`Hall: ${p.hall_no}`);
      doc.fontSize(12).text(`Invigilator: ${p.invigilator}`);
      doc.moveDown();
    }

    doc.fontSize(10).text(`${p.seat} - ${p.regno} (${p.dept})`);
  });

  doc.end();
});


/* =======================
   14. SERVER
======================= */
app.listen(3000, () => {
  console.log("🚀 Server running at http://localhost:3000");
});
