export const YEARS = ['1st Year', '2nd Year', '3rd Year'];

export const ACTIVE_DEPARTMENT_FILTER = ['isActive', '==', true];

export const normalizeDepartment = (departmentDoc) => ({
  id: departmentDoc.id,
  ...departmentDoc.data(),
});

export const isDepartmentActive = (department) => department?.isActive === true;

export const sortDepartmentsByName = (departments = []) => (
  [...departments].sort((a, b) => (a.name || '').localeCompare(b.name || ''))
);

export const filterDepartmentsByYear = (departments = [], year) => (
  departments.filter((department) => department.year === year)
);

export const getDepartmentNameById = (departments = [], departmentId) => {
  const department = departments.find((item) => item.id === departmentId);
  return department?.name || '';
};
