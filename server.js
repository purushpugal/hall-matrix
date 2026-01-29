console.log("✅ server.js loaded");

/* =======================
   1. IMPORTS
======================= */
const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const session = require("express-session");
const multer = require("multer");
const XLSX = require("xlsx");
const fs = require("fs");
const PDFDocument = require("pdfkit");

const { allocateBySubjectHallWise } = require("./utils/allocationLogic");

/* =======================
   2. APP & DB
======================= */
const app = express();

const db = new sqlite3.Database(
  "./hall_matrix.db",
  sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE,
  (err) => {
    if (err) console.error("DB connection error:", err.message);
    else console.log("✅ SQLite connected");
  },
);

/* =======================
   3. MIDDLEWARE
======================= */
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));
app.set("view engine", "ejs");
const upload = multer({ dest: "uploads/" });

/* =======================
   4. SESSION
======================= */
app.use(
  session({
    secret: "hallmatrix_secret",
    resave: false,
    saveUninitialized: false,
  }),
);

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
    subject_code TEXT UNIQUE,
    subject_name TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS invigilators (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    dept TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS seat_allocations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    regno TEXT,
    subject_code TEXT,
    hall_no TEXT,
    seat_label TEXT,
    dept TEXT,
    exam_date TEXT,
    session TEXT,
    invigilator TEXT
  )`);
});

/* =======================
   7. AUTH ROUTES
======================= */
app.get("/", (req, res) => res.redirect("/login"));

app.get("/login", (req, res) => {
  res.render("login", { message: "" });
});

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
    },
  );
});

app.get("/register", (req, res) => {
  res.render("register", { message: "" });
});

app.post("/register", (req, res) => {
  const { name, username, password, role } = req.body;

  db.run(
    "INSERT INTO users (name, username, password, role) VALUES (?,?,?,?)",
    [name, username, password, role || "admin"],
    (err) => {
      if (err) {
        return res.render("register", {
          message: "Username already exists",
        });
      }
      res.redirect("/login");
    },
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
    () => res.redirect("/students"),
  );
});

app.post("/students/delete/:id", requireLogin, (req, res) => {
  db.run("DELETE FROM students WHERE id=?", [req.params.id], () =>
    res.redirect("/students"),
  );
});

app.post(
  "/students/upload",
  requireLogin,
  upload.single("file"),
  (req, res) => {
    if (!req.file) return res.redirect("/students");

    const wb = XLSX.readFile(req.file.path);
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(sheet);

    const stmt = db.prepare(
      "INSERT OR IGNORE INTO students (regno, dept, subject_code) VALUES (?,?,?)",
    );

    data.forEach((r) => {
      if (r.regno && r.dept && r.subject_code) {
        stmt.run(r.regno, r.dept, r.subject_code);
      }
    });

    stmt.finalize();
    fs.unlinkSync(req.file.path);
    res.redirect("/students");
  },
);

/* =======================
   10. SUBJECTS
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
  const { subject_code, subject_name } = req.body;
  db.run(
    "INSERT OR IGNORE INTO subjects VALUES (NULL,?,?)",
    [subject_code, subject_name],
    () => res.redirect("/subjects"),
  );
});
app.get("/subjects", requireLogin, (req, res) => {
  db.all("SELECT * FROM subjects", (err, rows) => {
    res.render("view_subjects", {
      subjects: rows,
      currentPage: "subjects",
    });
  });
});

app.post(
  "/subjects/upload",
  requireLogin,
  upload.single("file"),
  (req, res) => {
    const wb = XLSX.readFile(req.file.path);
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet);

    const stmt = db.prepare(
      "INSERT OR IGNORE INTO subjects (subject_code, subject_name) VALUES (?,?)",
    );

    rows.forEach((r) => {
      if (r.subject_code && r.subject_name) {
        stmt.run(r.subject_code, r.subject_name);
      }
    });

    stmt.finalize();
    fs.unlinkSync(req.file.path);
    res.redirect("/subjects");
  },
);
app.post("/subjects/delete/:id", requireLogin, (req, res) => {
  db.run("DELETE FROM subjects WHERE id=?", [req.params.id], () =>
    res.redirect("/subjects"),
  );
});

/* =======================
   11. HALLS
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
    "INSERT OR IGNORE INTO halls (hall_no, capacity, block) VALUES (?,?,?)",
    [hall_no, capacity, block],
    () => res.redirect("/halls"),
  );
});
app.post("/halls/upload", requireLogin, upload.single("file"), (req, res) => {
  const wb = XLSX.readFile(req.file.path);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet);

  const stmt = db.prepare(
    "INSERT OR IGNORE INTO halls (hall_no, capacity, block) VALUES (?,?,?)",
  );

  rows.forEach((r) => {
    if (r.hall_no && r.capacity) {
      stmt.run(r.hall_no, r.capacity, r.block || "");
    }
  });

  stmt.finalize();
  fs.unlinkSync(req.file.path);
  res.redirect("/halls");
});
app.post("/halls/delete/:id", requireLogin, (req, res) => {
  db.run("DELETE FROM halls WHERE id=?", [req.params.id], () =>
    res.redirect("/halls"),
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
    () => res.redirect("/invigilators"),
  );
});
app.post(
  "/invigilators/upload",
  requireLogin,
  upload.single("file"),
  (req, res) => {
    const wb = XLSX.readFile(req.file.path);
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet);

    const stmt = db.prepare(
      "INSERT INTO invigilators (name, dept) VALUES (?,?)",
    );

    rows.forEach((r) => {
      if (r.name && r.dept) stmt.run(r.name, r.dept);
    });

    stmt.finalize();
    fs.unlinkSync(req.file.path);
    res.redirect("/invigilators");
  },
);

/* =======================
   13. STUDENT VIEW
======================= */
app.get("/student-view", (req, res) => {
  res.render("student-view", {
    result: null,
    error: null,
  });
});

app.post("/student-view", (req, res) => {
  let regno = String(req.body.regno || "").trim();

  // 🔥 normalize
  regno = regno.replace(/\.0$/, "");

  db.get(
    `
    SELECT
      REPLACE(regno, '.0', '') AS regno,
      dept,
      subject_code,
      hall_no,
      seat_label,
      exam_date,
      session,
      invigilator
    FROM seat_allocations
    WHERE REPLACE(regno, '.0', '') = ?
    `,
    [regno],
    (err, row) => {
      if (err) {
        return res.render("student-view", {
          result: null,
          error: "Database error",
        });
      }

      if (!row) {
        return res.render("student-view", {
          result: null,
          error: "No allocation found",
        });
      }

      res.render("student-view", {
        result: row,
        error: null,
      });
    },
  );
});



/* =======================
   14. ALLOCATION
======================= */
app.get("/allocation", requireLogin, (req, res) => {
  res.render("allocation", { currentPage: "allocation" });
});

app.post("/allocation/generate", requireLogin, (req, res) => {
  const { subject_codes, exam_date, session } = req.body;

  if (!subject_codes || !exam_date || !session) {
    return res.send("Missing allocation inputs");
  }

  const codes = subject_codes.split(",").map((c) => c.trim());

  db.all(
    `SELECT * FROM students WHERE subject_code IN (${codes
      .map(() => "?")
      .join(",")})`,
    codes,
    (err, students) => {
      if (err || students.length === 0) {
        return res.send("No students found for selected subjects");
      }

      db.all("SELECT * FROM halls ORDER BY hall_no", (err, halls) => {
        db.all("SELECT * FROM invigilators", (err, invs) => {
          if (!halls.length || !invs.length) {
            return res.send("Halls or Invigilators missing");
          }

          const raw = allocateBySubjectHallWise(students, halls);

          let seatCounter = {};
          let hallInv = {};
          let invIndex = 0;

          const preview = raw.map((r) => {
            if (!seatCounter[r.hall_no]) {
              seatCounter[r.hall_no] = 0;
              hallInv[r.hall_no] = invs[invIndex++ % invs.length].name;
            }

            const idx = seatCounter[r.hall_no]++;
            const seat =
              ["A", "B", "C", "D"][idx % 4] + (Math.floor(idx / 4) + 1);

            return {
              regno: r.student.regno,
              dept: r.student.dept,
              subject_code: r.student.subject_code,
              hall_no: r.hall_no,
              seat_label: seat,
              invigilator: hallInv[r.hall_no],
              exam_date,
              session,
            };
          });

          // 🔥 STORE PREVIEW IN SESSION
          req.session.preview = preview;

          // 🔥 REDIRECT TO PREVIEW PAGE
          res.redirect("/allocation/preview");
        });
      });
    },
  );
});

/* =======================
   15. PREVIEW (FIXED)
======================= */
app.get("/allocation/preview", requireLogin, (req, res) => {
  if (!req.session.preview || req.session.preview.length === 0) {
    return res.redirect("/allocation");
  }

  res.render("allocation_preview", {
    preview: req.session.preview,
  });
});

/* =======================
   16. CONFIRM
======================= */
app.post("/allocation/confirm", requireLogin, (req, res) => {
  if (!req.session.preview) return res.redirect("/allocation");

  db.run("DELETE FROM seat_allocations");

  const stmt = db.prepare(`
    INSERT INTO seat_allocations
    (regno, subject_code, hall_no, seat_label, dept, exam_date, session, invigilator)
    VALUES (?,?,?,?,?,?,?,?)
  `);

  req.session.preview.forEach((p) => {
    stmt.run(
      p.regno,
      p.subject_code,
      p.hall_no,
      p.seat_label,
      p.dept,
      p.exam_date,
      p.session,
      p.invigilator,
    );
  });

  stmt.finalize();

  res.redirect("/dashboard");
});

/* =======================
   17. PDF ROUTES
======================= */

app.get("/allocation/pdf-hall", requireLogin, (req, res) => {
  if (!req.session.preview || req.session.preview.length === 0) {
    return res.send("No allocation preview available");
  }

  const doc = new PDFDocument({ margin: 36, size: "A4" });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    "inline; filename=Exam_Hall_Seating.pdf",
  );
  doc.pipe(res);

  const date = req.session.preview[0].exam_date;
  const session = req.session.preview[0].session;

  /* GROUP BY HALL */
  const halls = {};
  req.session.preview.forEach((p) => {
    if (!halls[p.hall_no]) halls[p.hall_no] = [];
    halls[p.hall_no].push(p);
  });

  const cols = ["A", "B", "C", "D"];
  const cellWidth = 135;
  const cellHeight = 70;

  Object.keys(halls).forEach((hallNo, index) => {
    if (index !== 0) doc.addPage();

    const seats = halls[hallNo];

    /* ===== HEADER ===== */
    const headerX = 30;
    const headerY = 20;
    const headerWidth = doc.page.width - 60;
    const headerHeight = 90;

    doc
      .roundedRect(headerX, headerY, headerWidth, headerHeight, 12)
      .fill("#0f172a");

    doc
      .fillColor("white")
      .fontSize(16)
      .text("EXAM HALL SEATING ARRANGEMENT", headerX, headerY + 14, {
        width: headerWidth,
        align: "center",
      })
      .fontSize(10)
      .text(`Date: ${date} | Session: ${session}`, headerX, headerY + 38, {
        width: headerWidth,
        align: "center",
      })
      .fontSize(11)
      .text(
        `Hall: ${hallNo}   |   Invigilator: ${seats[0].invigilator}`,
        headerX,
        headerY + 62,
        { width: headerWidth, align: "center" },
      );

    doc.fillColor("black");
    doc.y = headerY + headerHeight + 20;

    /* MAP SEATS (FIXED) */
    const seatMap = {};
    seats.forEach((s) => (seatMap[s.seat_label] = s));

    const maxRow = Math.max(
      ...seats.map((s) => parseInt(s.seat_label.slice(1))),
    );

    let x = (doc.page.width - cols.length * cellWidth) / 2;
    let y = doc.y;

    /* COLUMN HEADERS */
    cols.forEach((c, i) => {
      doc
        .roundedRect(x + i * cellWidth, y, cellWidth - 10, 38, 8)
        .fill("#1e293b");

      doc
        .fillColor("white")
        .fontSize(13)
        .text(c, x + i * cellWidth, y + 10, {
          width: cellWidth - 10,
          align: "center",
        });

      doc.fillColor("black");
    });

    y += 50;

    /* SEAT GRID */
    for (let r = 1; r <= maxRow; r++) {
      cols.forEach((c, i) => {
        const key = c + r;
        const s = seatMap[key];

        const bx = x + i * cellWidth;
        const by = y;

        doc
          .roundedRect(bx, by, cellWidth - 10, cellHeight, 8)
          .stroke("#cbd5e1");

        if (s) {
          doc
            .fontSize(10)
            .text(key, bx, by + 8, { width: cellWidth - 10, align: "center" })
            .fontSize(11)
            .text(String(s.regno).replace(/\.0$/, ""), bx, by + 26, {
              width: cellWidth - 10,
              align: "center",
            })
            .fontSize(9)
            .fillColor("#475569")
            .text(s.dept, bx, by + 46, {
              width: cellWidth - 10,
              align: "center",
            })
            .fillColor("black");
        }
      });

      y += cellHeight + 14;

      if (y + cellHeight > doc.page.height - 40) {
        doc.addPage();
        y = 90;
      }
    }
  });

  doc.end();
});

app.get("/allocation/pdf-summary", requireLogin, (req, res) => {
  db.all(
    `
    SELECT hall_no, subject_code, regno, exam_date, session
    FROM seat_allocations
    ORDER BY hall_no, subject_code, regno
    `,
    (err, rows) => {
      if (err || rows.length === 0) {
        return res.send("No allocation data found");
      }

      /* ---------- GROUP DATA ---------- */
      const hallMap = {};
      rows.forEach((r) => {
        if (!hallMap[r.hall_no]) hallMap[r.hall_no] = {};
        if (!hallMap[r.hall_no][r.subject_code])
          hallMap[r.hall_no][r.subject_code] = [];
        hallMap[r.hall_no][r.subject_code].push(
          String(r.regno).replace(/\.0$/, ""),
        );
      });

      const halls = Object.keys(hallMap);
      const meta = rows[0];

      const doc = new PDFDocument({
        size: "A4",
        layout: "landscape",
        margins: { top: 0, left: 0, right: 0, bottom: 25 },
      });

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        "inline; filename=Hall_Allocation_Summary.pdf",
      );
      doc.pipe(res);

      /* ---------- HEADER (FULL WIDTH, NO GAPS) ---------- */
      const headerHeight = 80;

      const drawHeader = () => {
        doc.save();

        doc.rect(0, 0, doc.page.width, headerHeight).fill("#0f172a");

        doc
          .fillColor("white")
          .fontSize(18)
          .text("ANNA UNIVERSITY, CHENNAI – 25", 0, 20, {
            width: doc.page.width,
            align: "center",
          });

        doc.fontSize(12).text("Examination Wing – Hall Allocation Summary", {
          width: doc.page.width,
          align: "center",
        });

        doc
          .fontSize(10)
          .text(`Date / Session : ${meta.exam_date} | ${meta.session}`, {
            width: doc.page.width,
            align: "center",
          });

        doc.restore();
      };

      drawHeader();

      /* ---------- GRID CONFIG ---------- */
      const boxW = 380;
      const boxH = 210;

      const startX = 30;
      const startY = headerHeight + 30;

      const gapX = 30;
      const gapY = 30;

      /* ---------- DRAW HALL BLOCK ---------- */
      function drawHallBlock(hallNo, x, y) {
        const subjects = hallMap[hallNo];
        let hallTotal = 0;

        // Outer box
        doc.roundedRect(x, y, boxW, boxH, 10).stroke("#94a3b8");

        // Header
        doc
          .roundedRect(x, y, boxW, 28, 10)
          .fill("#1e293b")
          .fillColor("white")
          .fontSize(11)
          .text(`HALL : ${hallNo}`, x, y + 7, {
            width: boxW,
            align: "center",
          })
          .fillColor("black");

        let cy = y + 40;
        const contentBottom = y + boxH - 34;

        /* SUBJECTS (CLIPPED) */
        Object.entries(subjects).forEach(([sub, regs]) => {
          if (cy + 24 > contentBottom) return;

          doc.fontSize(9).text(sub, x + 12, cy);
          cy += 12;

          doc
            .fontSize(8)
            .fillColor("#334155")
            .text(regs.join(", "), x + 12, cy, {
              width: boxW - 24,
              height: contentBottom - cy,
              ellipsis: true,
            })
            .fillColor("black");

          cy += 22;
          hallTotal += regs.length;
        });

        /* FOOTER (FIXED POSITION) */
        doc.rect(x, y + boxH - 26, boxW, 26).fill("#f1f5f9");

        doc
          .fillColor("black")
          .fontSize(10)
          .text(`HALL TOTAL : ${hallTotal}`, x, y + boxH - 18, {
            width: boxW,
            align: "center",
          });
      }

      /* ---------- MAIN LOOP ---------- */
      halls.forEach((hallNo, i) => {
        if (i > 0 && i % 4 === 0) {
          doc.addPage();
          drawHeader();
        }

        const pos = i % 4;
        const col = pos % 2;
        const row = Math.floor(pos / 2);

        const x = startX + col * (boxW + gapX);
        const y = startY + row * (boxH + gapY);

        drawHallBlock(hallNo, x, y);
      });

      doc.end();
    },
  );
});

/* =======================
   18. SERVER
======================= */
app.listen(3000, () => {
  console.log("🚀 Server running at http://localhost:3000");
});
