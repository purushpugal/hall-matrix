console.log("✅ server.js loaded");

/* =======================
   1. IMPORTS
======================= */
const {
  allocateRule1,
  allocateRule2,
  getSeatLabel,
  allocateBySubjectHallWise,
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
  }),
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
function applySeatLabels(allocations) {
  const cols = ["A", "B", "C", "D"];
  let hallSeatCount = {};

  return allocations.map((a) => {
    if (!hallSeatCount[a.hall_no]) hallSeatCount[a.hall_no] = 0;
    const i = hallSeatCount[a.hall_no]++;
    const row = Math.floor(i / 4) + 1;
    const col = cols[i % 4];

    return {
      hall_no: a.hall_no,
      seat: col + row,
      regno: a.student.regno,
      dept: a.student.dept,
      subject_code: a.student.subject_code,
    };
  });
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

 db.run(`
  CREATE TABLE IF NOT EXISTS subjects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subject_code TEXT UNIQUE NOT NULL,
    subject_name TEXT NOT NULL
  )
`);


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
    },
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
    () => res.redirect("/students"),
  );
});

app.post("/students/upload", upload.single("file"), (req, res) => {
  if (!req.file) {
    return res.send("No file uploaded");
  }

  const workbook = XLSX.readFile(req.file.path);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet);

  const stmt = db.prepare(
    "INSERT OR IGNORE INTO students (regno, dept, subject_code) VALUES (?,?,?)",
  );

  rows.forEach((r) => {
    if (r.regno && r.dept && r.subject_code) {
      stmt.run(r.regno, r.dept, r.subject_code);
    }
  });

  stmt.finalize();
  fs.unlinkSync(req.file.path);
  res.redirect("/students");
});


app.post("/students/delete/:id", requireLogin, (req, res) => {
  db.run("DELETE FROM students WHERE id=?", [req.params.id], () =>
    res.redirect("/students"),
  );
});
app.get("/student-view", (req, res) => {
  const regno = req.query.regno;
  let student = null;

  if (regno && req.session.preview) {
    student = req.session.preview.find(
      (p) => String(p.regno) === String(regno),
    );
  }

  res.render("student-view", {
    student,
    searched: !!regno,
  });
});

app.post("/student-view", (req, res) => {
  const { regno } = req.body;

  if (!req.session.preview || req.session.preview.length === 0) {
    return res.render("student_view", {
      result: null,
      error: "Allocation not generated yet",
    });
  }

  const found = req.session.preview.find(
    (s) => String(s.regno) === String(regno),
  );

  if (!found) {
    return res.render("student_view", {
      result: null,
      error: "No hall details found for this register number",
    });
  }

  res.render("student_view", {
    result: {
      regno: found.regno,
      hall: found.hall_no,
      seat: found.seat,
      subject: found.subject_code,
      invigilator: found.invigilator,
      date: req.session.examDate || "N/A",
      session: req.session.examSession || "N/A",
    },
    error: null,
  });
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
    () => res.redirect("/halls"),
  );
});
app.post("/halls/upload", upload.single("file"), (req, res) => {
  const workbook = XLSX.readFile(req.file.path);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet);

  const stmt = db.prepare(
    "INSERT INTO halls (hall_no, capacity, block) VALUES (?, ?, ?)",
  );

  rows.forEach((row) => {
    if (row.hall_no && row.capacity && row.block) {
      stmt.run(row.hall_no, row.capacity, row.block);
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

app.post("/subjects/add", (req, res) => {
  const { subject_code, subject_name } = req.body;

  db.run(
    "INSERT OR IGNORE INTO subjects (subject_code, subject_name) VALUES (?, ?)",
    [subject_code, subject_name],
    (err) => {
      if (err) {
        console.error("Subject insert error:", err.message);
      }
      res.redirect("/subjects");
    },
  );
});

app.post("/subjects/upload", upload.single("file"), (req, res) => {
  const workbook = XLSX.readFile(req.file.path);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet);

  const stmt = db.prepare(
    "INSERT INTO subjects (subject_code, subject_name) VALUES (?, ?)",
  );

  rows.forEach((row) => {
    if (row.subject_code && row.subject_name) {
      stmt.run(row.subject_code, row.subject_name);
    }
  });

  stmt.finalize();
  fs.unlinkSync(req.file.path);

  res.redirect("/subjects");
});


app.post("/subjects/delete/:id", requireLogin, (req, res) => {
  db.run("DELETE FROM subjects WHERE id=?", [req.params.id], () =>
    res.redirect("/subjects"),
  );
});

/* =======================
   12. INVIGILATORS
======================= */
app.get("/invigilators", requireLogin, (req, res) => {
  db.all("SELECT * FROM invigilators", (err, rows) => {
    if (err) return res.send("Database error");

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
app.post("/invigilators/upload", upload.single("file"), (req, res) => {
  try {
    if (!req.file) {
      return res.send("❌ No file uploaded");
    }

    const workbook = XLSX.readFile(req.file.path);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet);

    if (rows.length === 0) {
      fs.unlinkSync(req.file.path);
      return res.send("❌ Excel file is empty");
    }

    const stmt = db.prepare(
      "INSERT INTO invigilators (name, dept) VALUES (?, ?)",
    );

    rows.forEach((row, index) => {
      if (!row.name || !row.dept) {
        console.log(`⚠️ Skipped row ${index + 1}`, row);
        return;
      }

      stmt.run(row.name, row.dept, (err) => {
        if (err) {
          console.log("DB ERROR (invigilators):", err.message);
        }
      });
    });

    stmt.finalize();
    fs.unlinkSync(req.file.path);

    res.redirect("/invigilators?uploaded=1");
  } catch (err) {
    console.error("UPLOAD ERROR (invigilators):", err);
    res.send("❌ Failed to process Excel file");
  }
});


app.post("/invigilators/delete/:id", requireLogin, (req, res) => {
  db.run("DELETE FROM invigilators WHERE id=?", [req.params.id], () =>
    res.redirect("/invigilators"),
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
  const codes = subject_codes.split(",").map((s) => s.trim());

  db.all(
    `SELECT * FROM students WHERE subject_code IN (${codes
      .map(() => "?")
      .join(",")})`,
    codes,
    (err, students) => {
      if (err || !students.length) {
        return res.send("No students found");
      }

      db.all("SELECT * FROM halls", (err, halls) => {
        if (err || !halls.length) {
          return res.send("No halls found");
        }

        db.all("SELECT * FROM invigilators", (err, invigilators) => {
          if (err || !invigilators.length) {
            return res.send("No invigilators found");
          }

          const rawAlloc = allocateBySubjectHallWise(students, halls);

          // 👉 Add seat labels
          // 1️⃣ Apply seat labels FIRST (on raw allocation)
          const labeledAlloc = applySeatLabels(rawAlloc);

          // 2️⃣ Assign invigilator per hall
          let invIndex = 0;
          const hallInvMap = {};

          labeledAlloc.forEach((a) => {
            if (!hallInvMap[a.hall_no]) {
              hallInvMap[a.hall_no] =
                invigilators[invIndex++ % invigilators.length].name;
            }
          });

          // 3️⃣ Final preview object
          const preview = labeledAlloc.map((a) => ({
            hall_no: a.hall_no,
            seat: a.seat, // ✅ NOW EXISTS
            regno: a.regno,
            dept: a.dept,
            subject_code: a.subject_code,
            invigilator: hallInvMap[a.hall_no],
            exam_date,
            session,
          }));

          req.session.preview = preview;
          res.redirect("/allocation/preview");
        });
      });
    },
  );
});

app.get("/allocation/view", requireLogin, (req, res) => {
  db.all("SELECT * FROM allocations", (err, rows) => {
    res.render("view_allocation", { allocations: rows });
  });
});
app.post("/allocation/confirm", requireLogin, (req, res) => {
  const stmt = db.prepare(`
    INSERT INTO allocations 
    (subject_code, hall_no, reg_no, exam_date, session, invigilator)
    VALUES (?,?,?,?,?,?)
  `);

  req.session.preview.forEach((p) => {
    stmt.run(
      p.subject_code,
      p.hall_no,
      p.regno,
      p.exam_date,
      p.session,
      p.invigilator,
    );
  });

  stmt.finalize();
  req.session.preview = null;
  res.redirect("/allocation/view");
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
  if (!req.session.preview || req.session.preview.length === 0) {
    return res.send("No allocation preview found");
  }

  const PDFDocument = require("pdfkit");
  const doc = new PDFDocument({ margin: 36, size: "A4" });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    "inline; filename=Exam_Hall_Seating.pdf",
  );
  doc.pipe(res);

  const date = req.session.preview[0].exam_date;
  const session = req.session.preview[0].session;

  // GROUP BY HALL
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

    // ===== HEADER CARD =====
    const headerX = 30;
    const headerY = 20;
    const headerWidth = doc.page.width - 60;
    const headerHeight = 90;

    doc
      .roundedRect(headerX, headerY, headerWidth, headerHeight, 12)
      .fill("#0f172a");

    // Title
    doc
      .fillColor("#ffffff")
      .fontSize(16)
      .text("EXAM HALL SEATING ARRANGEMENT", headerX, headerY + 14, {
        width: headerWidth,
        align: "center",
      });

    // Date & Session
    doc
      .fontSize(10)
      .text(`Date: ${date}   |   Session: ${session}`, headerX, headerY + 38, {
        width: headerWidth,
        align: "center",
      });

    // Hall + Invigilator (inside header)
    doc
      .fontSize(11)
      .text(
        `Hall: ${hallNo}        Invigilator: ${seats[0].invigilator}`,
        headerX,
        headerY + 62,
        { width: headerWidth, align: "center" },
      );

    // Reset for body
    doc.fillColor("#000000");
    doc.y = headerY + headerHeight + 20;

    /* ---------- BUILD SEAT GRID ---------- */

    const seatMap = {};
    seats.forEach((s) => (seatMap[s.seat] = s));

    const maxRow = Math.max(...seats.map((s) => parseInt(s.seat.slice(1))));

    // Center grid horizontally
    let x = (doc.page.width - cols.length * cellWidth) / 2;

    let y = doc.y;

    /* COLUMN HEADERS */
    cols.forEach((c, i) => {
      doc
        .roundedRect(x + i * cellWidth, y, cellWidth - 10, 38, 8)
        .fill("#1e293b");

      doc
        .fillColor("#ffffff")
        .fontSize(13)
        .text(c, x + i * cellWidth, y + 10, {
          width: cellWidth - 10,
          align: "center",
        });

      doc.fillColor("#000000");
    });

    y += 50;

    /* SEAT CARDS */
    for (let r = 1; r <= maxRow; r++) {
      cols.forEach((c, i) => {
        const key = c + r;
        const s = seatMap[key];

        const boxX = x + i * cellWidth;
        const boxY = y;

        doc
          .roundedRect(boxX, boxY, cellWidth - 10, cellHeight, 8)
          .stroke("#cbd5e1");

        if (s) {
          doc
            .fontSize(10)
            .fillColor("#0f172a")
            .text(key, boxX, boxY + 10, {
              width: cellWidth - 10,
              align: "center",
            });

          doc
            .fontSize(11)
            .fillColor("#0f172a")
            .text(String(s.regno).replace(/\.0$/, ""), boxX, boxY + 28, {
              width: cellWidth - 10,
              align: "center",
            });

          doc
            .fontSize(9)
            .fillColor("#475569")
            .text(s.dept, boxX, boxY + 48, {
              width: cellWidth - 10,
              align: "center",
            });
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
  if (!req.session.preview || req.session.preview.length === 0) {
    return res.send("No allocation preview found");
  }

  const PDFDocument = require("pdfkit");

  // LANDSCAPE A4
  const doc = new PDFDocument({
    size: "A4",
    layout: "landscape",
    margin: 30,
  });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    "inline; filename=Hall_Allocation_Summary_Landscape.pdf",
  );

  doc.pipe(res);

  const preview = req.session.preview;
  const examDate = preview[0].exam_date;
  const session = preview[0].session;

  /* ================= GROUP DATA ================= */
  const hallMap = {};
  preview.forEach((p) => {
    if (!hallMap[p.hall_no]) hallMap[p.hall_no] = {};
    if (!hallMap[p.hall_no][p.subject_code])
      hallMap[p.hall_no][p.subject_code] = [];
    hallMap[p.hall_no][p.subject_code].push(
      String(p.regno).replace(/\.0$/, ""),
    );
  });

  const hallNames = Object.keys(hallMap);

  /* ================= HEADER ================= */
  function drawHeader() {
    doc.rect(0, 0, doc.page.width, 60).fill("#0f172a");

    doc
      .fillColor("#ffffff")
      .fontSize(16)
      .text("ANNA UNIVERSITY, CHENNAI – 25", 0, 16, {
        align: "center",
      });

    doc
      .fontSize(11)
      .text("Examination Wing – Hall Allocation Summary", { align: "center" });

    doc.fontSize(10).text(`Date / Session : ${examDate}  |  ${session}`, {
      align: "center",
    });

    doc.fillColor("#000000");
  }

  drawHeader();

  /* ================= GRID CONFIG ================= */
  const blockWidth = 380;
  const blockHeight = 200;

  const startX = 30;
  const startY = 80;

  const gapX = 30;
  const gapY = 20;

  const hallsPerPage = 4;

  /* ================= DRAW HALL BLOCK ================= */
  function drawHallBlock(hallNo, x, y) {
    const subjects = hallMap[hallNo];
    let hallTotal = 0;

    // Outer box
    doc.roundedRect(x, y, blockWidth, blockHeight, 8).stroke("#94a3b8");

    // Hall header
    doc.roundedRect(x, y, blockWidth, 28, 8).fill("#1e293b");

    doc
      .fillColor("#ffffff")
      .fontSize(12)
      .text(`HALL : ${hallNo}`, x, y + 7, {
        width: blockWidth,
        align: "center",
      });

    doc.fillColor("#000000");

    let cursorY = y + 36;

    Object.keys(subjects).forEach((sub) => {
      const regs = subjects[sub];
      hallTotal += regs.length;

      doc
        .fontSize(10)
        .fillColor("#0f172a")
        .text(sub, x + 8, cursorY);

      cursorY += 12;

      doc
        .fontSize(8)
        .fillColor("#334155")
        .text(regs.join(", "), x + 8, cursorY, {
          width: blockWidth - 16,
        });

      cursorY += 22;
    });

    // Hall total
    doc.rect(x, y + blockHeight - 26, blockWidth, 26).fill("#f1f5f9");

    doc
      .fillColor("#000000")
      .fontSize(10)
      .text(`HALL TOTAL : ${hallTotal}`, x, y + blockHeight - 18, {
        width: blockWidth,
        align: "center",
      });
  }

  /* ================= MAIN LOOP ================= */
  hallNames.forEach((hallNo, index) => {
    // New page every 6 halls
    if (index > 0 && index % hallsPerPage === 0) {
      doc.addPage();
      drawHeader();
    }

    const pos = index % hallsPerPage;
    const col = pos % 2; // 0 or 1
    const row = Math.floor(pos / 2); // 0,1,2

    const x = startX + col * (blockWidth + gapX);
    const y = startY + row * (blockHeight + gapY);

    drawHallBlock(hallNo, x, y);
  });

  doc.end();
});

/* =======================
   14. SERVER
======================= */
app.listen(3000, () => {
  console.log("🚀 Server running at http://localhost:3000");
});
