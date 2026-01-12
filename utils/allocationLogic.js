module.exports = function allocateStudents({
  students,
  halls,
  date,
  session,
  invigilator,
}) {
  // Shuffle students for better mixing
  students = students.sort(() => Math.random() - 0.5);

  let allocations = [];
  let studentIndex = 0;

  for (const hall of halls) {
    const seats = hall.rows * hall.cols;

    // Build empty matrix
    let matrix = Array.from({ length: hall.rows }, () =>
      Array(hall.cols).fill(null)
    );

    for (let r = 0; r < hall.rows; r++) {
      for (let c = 0; c < hall.cols; c++) {
        if (studentIndex >= students.length) break;

        let placed = false;

        for (let i = studentIndex; i < students.length; i++) {
          const student = students[i];

          // Check adjacency rule
          if (isSafe(matrix, r, c, student.dept)) {
            matrix[r][c] = student;

            allocations.push({
              hall_no: hall.hall_no,
              row: r + 1,
              col: c + 1,
              regno: student.regno,
              dept: student.dept,
              exam_date: date,
              session,
              invigilator,
            });

            students.splice(i, 1);
            placed = true;
            break;
          }
        }

        if (!placed && students.length > 0) {
          // Rule-2 fallback (same dept allowed)
          const student = students.shift();
          matrix[r][c] = student;

          allocations.push({
            hall_no: hall.hall_no,
            row: r + 1,
            col: c + 1,
            regno: student.regno,
            dept: student.dept,
            exam_date: date,
            session,
            invigilator,
          });
        }
      }
    }
  }

  return allocations;
};

// 🔒 adjacency checker
function isSafe(matrix, r, c, dept) {
  const directions = [
    [-1, 0], // front
    [1, 0], // back
    [0, -1], // left
    [0, 1], // right
  ];

  for (const [dr, dc] of directions) {
    const nr = r + dr;
    const nc = c + dc;

    if (matrix[nr] && matrix[nr][nc] && matrix[nr][nc].dept === dept) {
      return false;
    }
  }
  return true;
}
