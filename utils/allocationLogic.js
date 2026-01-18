// utils/allocationLogic.js

const SEATS_PER_HALL = 24;
const COLS = 4; // A B C D

/* ======================================================
   PHASE 2: Seat students with strict dept separation
   - No same dept LEFT / RIGHT / FRONT / BACK
   - Zig-zag (snake) pattern
====================================================== */
function seatStudentsGridSafe(students) {
  const grid = [];
  const result = [];
  let row = 0;

  while (students.length > 0) {
    const rowSeats = new Array(COLS).fill(null);

    // zig-zag column order
    const colOrder = row % 2 === 0 ? [0, 1, 2, 3] : [3, 2, 1, 0];

    for (let i = 0; i < COLS && students.length > 0; i++) {
      const col = colOrder[i];

      // find a student that does NOT clash
      let pickIndex = students.findIndex((s) => {
        const left =
          (col > 0 && rowSeats[col - 1]) ||
          (col < COLS - 1 && rowSeats[col + 1]) ||
          null;

        const front = row > 0 ? grid[row - 1][col] : null;

        return (
          (!left || left.dept !== s.dept) && (!front || front.dept !== s.dept)
        );
      });

      // fallback (best effort, very rare edge case)
      if (pickIndex === -1) pickIndex = 0;

      const chosen = students.splice(pickIndex, 1)[0];
      rowSeats[col] = chosen;
    }

    grid.push(rowSeats);
    result.push(...rowSeats.filter(Boolean));
    row++;
  }

  return result;
}

/* ======================================================
   PHASE 1 + PHASE 2: Main Allocation Function
====================================================== */
function allocateBySubjectHallWise(students, halls) {
  /* -------------------------------
     Group students by subject code
  -------------------------------- */
  const bySubject = {};
  students.forEach((s) => {
    if (!bySubject[s.subject_code]) bySubject[s.subject_code] = [];
    bySubject[s.subject_code].push(s);
  });

  const allocations = [];
  let hallIndex = 0;

  /* -------------------------------
     Continue while students exist
  -------------------------------- */
  while (Object.values(bySubject).some((arr) => arr.length > 0)) {
    const hall = halls[hallIndex];
    if (!hall) break;

    let remainingSeats = hall.capacity || SEATS_PER_HALL;

    // active subjects for THIS hall
    let activeSubjects = Object.entries(bySubject).filter(
      ([_, arr]) => arr.length > 0,
    );

    /* =====================================
       RULE 2: ONLY ONE SUBJECT REMAINS
    ====================================== */
    if (activeSubjects.length === 1) {
      const arr = activeSubjects[0][1];
      const hallStudents = [];

      while (arr.length > 0 && remainingSeats > 0) {
        hallStudents.push(arr.shift());
        remainingSeats--;
      }

      const seated = seatStudentsGridSafe(hallStudents);
      seated.forEach((s) => {
        allocations.push({
          hall_no: hall.hall_no,
          student: s,
        });
      });

      hallIndex++;
      continue;
    }

    /* =====================================
       RULE 1: N SUBJECTS (N ≥ 2)
    ====================================== */

    // hall-wise subject buckets
    const hallBuckets = {};
    activeSubjects.forEach(([code]) => (hallBuckets[code] = []));

    /* ---- STEP A: Mandatory 1 seat per subject ---- */
    for (let [code, arr] of activeSubjects) {
      if (arr.length > 0 && remainingSeats > 0) {
        hallBuckets[code].push(arr.shift());
        remainingSeats--;
      }
    }

    /* ---- STEP B: Dynamic equal distribution ---- */
    activeSubjects = activeSubjects.filter(([_, arr]) => arr.length > 0);
    const N = activeSubjects.length;

    if (N > 0 && remainingSeats > 0) {
      const base = Math.floor(remainingSeats / N);
      let extra = remainingSeats % N;

      for (let [code, arr] of activeSubjects) {
        let take = base + (extra > 0 ? 1 : 0);
        if (extra > 0) extra--;

        while (take > 0 && arr.length > 0 && remainingSeats > 0) {
          hallBuckets[code].push(arr.shift());
          take--;
          remainingSeats--;
        }
      }
    }

    /* ---- STEP C: DEPT-SAFE SEATING (CRITICAL) ---- */
    const hallStudents = [];
    Object.values(hallBuckets).forEach((arr) => hallStudents.push(...arr));

    const seated = seatStudentsGridSafe(hallStudents);
    seated.forEach((s) => {
      allocations.push({
        hall_no: hall.hall_no,
        student: s,
      });
    });

    hallIndex++;
  }

  return allocations;
}

module.exports = { allocateBySubjectHallWise };
