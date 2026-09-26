export const isDeletedStudent = (student) =>
  student?.isDeleted === true || student?.status === 'deleted';

export const getStudentUid = (student) => student?.uid || student?.id || null;

export const getActiveStudents = (students = []) =>
  students.filter((student) => !isDeletedStudent(student));

export const getActiveStudentIds = (students = []) =>
  getActiveStudents(students)
    .map((student) => getStudentUid(student))
    .filter(Boolean);

export const filterByActiveStudentIds = (
  rows = [],
  activeStudentIds = [],
  getRowStudentId = (row) => row?.studentId
) => {
  const idSet = new Set(activeStudentIds);
  return rows.filter((row) => idSet.has(getRowStudentId(row)));
};
