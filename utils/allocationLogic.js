function getSeatLabel(index) {
  const cols = ["A", "B", "C", "D"];
  const row = Math.floor(index / 4) + 1;
  const col = cols[index % 4];
  return col + row;
}

function canPlace(grid, index, student) {
  const row = Math.floor(index / 4);
  const col = index % 4;

  const neighbors = [];

  // left
  if (col > 0) neighbors.push(grid[row][col - 1]);
  // right
  if (col < 3) neighbors.push(grid[row][col + 1]);
  // front
  if (row > 0) neighbors.push(grid[row - 1][col]);
  // back
  if (grid[row + 1]) neighbors.push(grid[row + 1][col]);

  return neighbors.every((n) => !n || n.dept !== student.dept);
}

function allocateRule1(students, capacity) {
  const grid = [];
  const used = new Set();

  const rows = Math.ceil(capacity / 4);

  for (let r = 0; r < rows; r++) {
    grid[r] = new Array(4).fill(null);
  }

  for (let i = 0; i < capacity; i++) {
    let placed = false;

    for (let s = 0; s < students.length; s++) {
      if (used.has(s)) continue;

      const student = students[s];
      const row = Math.floor(i / 4);
      const col = i % 4;

      if (canPlace(grid, i, student)) {
        grid[row][col] = student;
        used.add(s);
        placed = true;
        break;
      }
    }

    if (!placed) {
      return null; // trigger Rule 2
    }
  }

  return grid;
}

function allocateRule2(students, capacity) {
  const zigzag = [0, 9, 1, 10, 2, 3, 11, 4, 12, 5, 6, 13, 7, 14, 8];

  const grid = [];
  const rows = Math.ceil(capacity / 4);

  for (let r = 0; r < rows; r++) {
    grid[r] = new Array(4).fill(null);
  }

  zigzag.forEach((pos, i) => {
    if (!students[i]) return;
    const row = Math.floor(pos / 4);
    const col = pos % 4;
    grid[row][col] = students[i];
  });

  return grid;
}

module.exports = {
  allocateRule1,
  allocateRule2,
  getSeatLabel,
};
