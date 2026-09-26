export const ROOT_ADMIN_EMAIL = 'tamillearning2024@gmail.com';

export const normalizeEmail = (value) => (value || '').trim().toLowerCase();

export const isRootAdmin = (user) => {
  if (!user) return false;
  return user?.isRootAdmin === true || normalizeEmail(user?.email) === ROOT_ADMIN_EMAIL;
};

export const isProtectedAdmin = (user) => {
  if (!user) return false;
  return isRootAdmin(user) || user?.isProtectedAdmin === true;
};

export const canPromote = (currentUserData, targetUser) => {
  return (
    currentUserData?.role === 'admin' &&
    !targetUser?.isDeleted &&
    targetUser?.role === 'student'
  );
};

export const canDemote = (currentUserData, targetUser, currentUserUid) => {
  const targetUid = targetUser?.uid || targetUser?.id;
  if (!targetUid) return false;
  if (targetUid === currentUserUid) return false;
  if (isRootAdmin(targetUser)) return false;
  if (targetUser?.isProtectedAdmin === true && !isRootAdmin(currentUserData)) return false;

  return currentUserData?.role === 'admin' && targetUser?.role === 'admin';
};
