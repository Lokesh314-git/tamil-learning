export const isDeletedAccount = (data) =>
  data?.isDeleted === true || data?.status === 'deleted';

export const isApprovedAccount = (data) =>
  data?.isApproved === true || data?.approved === true || data?.status === 'active';
