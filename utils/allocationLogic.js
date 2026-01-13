// utils/allocationLogic.js

const SEATS_PER_HALL = 24;

/**
 * Main allocation function
 */
function allocateBySubjectHallWise(students, halls) {
  const bySubject = {};
  students.forEach((s) => {
    if (!bySubject[s.subject_code]) bySubject[s.subject_code] = [];
    bySubject[s.subject_code].push(s);
  });

  const allocations = [];
  let hallIndex = 0;

  while (Object.values(bySubject).some((arr) => arr.length > 0)) {
    const hall = halls[hallIndex];
    if (!hall) break;

    let remainingSeats = hall.capacity || 24;

    while (remainingSeats > 0) {
      // Recalculate active subjects every iteration
      let activeSubjects = Object.entries(bySubject)
        .filter(([_, arr]) => arr.length > 0)
        .sort((a, b) => b[1].length - a[1].length);

      if (activeSubjects.length === 0) break;

      // RULE 2: only one subject left
      if (activeSubjects.length === 1) {
        const arr = activeSubjects[0][1];
        while (arr.length && remainingSeats > 0) {
          allocations.push({ hall_no: hall.hall_no, student: arr.shift() });
          remainingSeats--;
        }
        break;
      }

      // RULE 1: pick top 2 or 3 subjects
      const pickCount = activeSubjects.length >= 3 ? 3 : 2;
      const picked = activeSubjects.slice(0, pickCount);

      let placedSomething = false;

      for (let [_, arr] of picked) {
        if (arr.length && remainingSeats > 0) {
          allocations.push({ hall_no: hall.hall_no, student: arr.shift() });
          remainingSeats--;
          placedSomething = true;
        }
      }

      // 🔑 CRITICAL SAFETY BREAK
      if (!placedSomething) break;
    }

    hallIndex++;
  }

  return allocations;
}


module.exports = { allocateBySubjectHallWise };
