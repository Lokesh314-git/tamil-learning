import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';

export const NOTIFICATION_TYPES = {
  NEW_TEST: 'new_test',
  REMINDER: 'reminder',
  TEST_UPDATED: 'test_updated',
  TEST_CANCELLED: 'test_cancelled',
  RESULTS_PUBLISHED: 'results_published',
  NEW_ASSIGNMENT: 'new_assignment',
  NEW_MATERIAL: 'new_material',
  NEW_ANNOUNCEMENT: 'new_announcement',
  URGENT_NOTICE: 'urgent_notice',
};

export const NOTIFICATION_TITLES = {
  [NOTIFICATION_TYPES.NEW_TEST]: 'New Online Test Available 📝',
  [NOTIFICATION_TYPES.REMINDER]: 'Upcoming Assessment Reminder ⏰',
  [NOTIFICATION_TYPES.TEST_UPDATED]: 'Test Schedule Updated 🔄',
  [NOTIFICATION_TYPES.TEST_CANCELLED]: 'Test Cancelled 🚫',
  [NOTIFICATION_TYPES.RESULTS_PUBLISHED]: 'Test Results Published 🏆',
  [NOTIFICATION_TYPES.NEW_ASSIGNMENT]: 'New Assignment Posted 📑',
  [NOTIFICATION_TYPES.NEW_MATERIAL]: 'New Study Material Uploaded 📚',
  [NOTIFICATION_TYPES.NEW_ANNOUNCEMENT]: 'New College Announcement 📢',
  [NOTIFICATION_TYPES.URGENT_NOTICE]: 'Urgent Notice ⚠️',
};

/**
 * Creates default message body for a given notification type and details
 */
export const getDefaultNotificationBody = (type, data) => {
  const title = data?.title || 'Academic Activity';
  const subject = data?.subject || data?.departmentName || 'Tamil';
  const dateStr = data?.testDate || data?.dueDate ? ` scheduled on ${data?.testDate || data?.dueDate}` : '';
  const timeStr = data?.testTime ? ` at ${data.testTime}` : '';

  switch (type) {
    case NOTIFICATION_TYPES.NEW_TEST:
      return `A new ${subject} test "${title}" has been published${dateStr}${timeStr}. Tap to start test.`;
    case NOTIFICATION_TYPES.REMINDER:
      return `Reminder: Your ${subject} test "${title}" is${dateStr}${timeStr}. Complete before the deadline.`;
    case NOTIFICATION_TYPES.TEST_UPDATED:
      return `Notice: Schedule for ${subject} test "${title}" has been updated${dateStr}${timeStr}.`;
    case NOTIFICATION_TYPES.TEST_CANCELLED:
      return `Important: The ${subject} test "${title}"${dateStr} has been cancelled by the administration.`;
    case NOTIFICATION_TYPES.RESULTS_PUBLISHED:
      return `Scores are published! Results for ${subject} test "${title}" are now available to view.`;
    case NOTIFICATION_TYPES.NEW_ASSIGNMENT:
      return `New homework assignment "${title}" for ${subject} is posted. Due date: ${data?.dueDate || 'Check app'}.`;
    case NOTIFICATION_TYPES.NEW_MATERIAL:
      return `New study notes & curriculum material "${title}" has been added for ${subject} (Unit ${data?.unitNumber || 1}).`;
    case NOTIFICATION_TYPES.NEW_ANNOUNCEMENT:
      return data?.content || `Notice: "${title}". Tap to read full announcement.`;
    case NOTIFICATION_TYPES.URGENT_NOTICE:
      return `URGENT: ${title}. Please check immediately.`;
    default:
      return `Update regarding ${subject}: "${title}". Tap to view.`;
  }
};

/**
 * Dispatches a notification across all student devices via Firestore and FCM.
 */
export const dispatchNotification = async ({
  type = NOTIFICATION_TYPES.NEW_TEST,
  title = '',
  body = '',
  testId = '',
  testTitle = '',
  taskId = '',
  materialId = '',
  announcementId = '',
  subject = 'Tamil',
  testDate = '',
  testTime = '',
  duration = '30',
  dueDate = '',
  unitNumber = 1,
  description = '',
  targetType = 'all', // 'all' | 'year' | 'department' | 'section'
  targetYear = 'all',
  targetDepartmentId = 'all',
  targetDepartmentName = 'All Classes',
  targetSection = 'all',
  targetBatch = 'all',
  route = '',
  isScheduled = false,
  scheduledFor = null
}) => {
  try {
    const resolvedTitle = title.trim() || NOTIFICATION_TITLES[type] || 'Educational Notice';
    const resolvedBody = body.trim() || getDefaultNotificationBody(type, {
      title: testTitle || title,
      subject,
      testDate,
      testTime,
      dueDate,
      unitNumber,
      departmentName: targetDepartmentName,
      content: description
    });

    // Default route determination if not specified
    let targetRoute = route;
    if (!targetRoute) {
      if (type === NOTIFICATION_TYPES.NEW_TEST || type === NOTIFICATION_TYPES.TEST_UPDATED || type === NOTIFICATION_TYPES.REMINDER) {
        targetRoute = testId ? `/student/tests?testId=${encodeURIComponent(testId)}` : '/student/tests';
      } else if (type === NOTIFICATION_TYPES.RESULTS_PUBLISHED) {
        targetRoute = testId ? `/student/tests?testId=${encodeURIComponent(testId)}` : '/student/tests';
      } else if (type === NOTIFICATION_TYPES.NEW_ASSIGNMENT) {
        targetRoute = '/student/tasks';
      } else if (type === NOTIFICATION_TYPES.NEW_MATERIAL) {
        targetRoute = '/student/units';
      } else {
        targetRoute = '/student/notifications';
      }
    }

    const notificationPayload = {
      type,
      title: resolvedTitle,
      body: resolvedBody,
      testId: String(testId || ''),
      testTitle: String(testTitle || title || ''),
      taskId: String(taskId || ''),
      materialId: String(materialId || ''),
      announcementId: String(announcementId || ''),
      subject: String(subject || 'Tamil'),
      testDate: String(testDate || ''),
      testTime: String(testTime || ''),
      duration: String(duration || '30'),
      dueDate: String(dueDate || ''),
      unitNumber: Number(unitNumber) || 1,
      description: String(description || ''),
      targetType,
      targetYear: String(targetYear || 'all'),
      targetDepartmentId: String(targetDepartmentId || 'all'),
      targetDepartmentName: String(targetDepartmentName || 'All Classes'),
      targetSection: String(targetSection || 'all'),
      targetBatch: String(targetBatch || 'all'),
      route: targetRoute,
      isScheduled: Boolean(isScheduled),
      scheduledFor: scheduledFor ? new Date(scheduledFor).toISOString() : null,
      status: isScheduled ? 'scheduled' : 'sent',
      createdAt: serverTimestamp(),
      sentAt: isScheduled ? null : serverTimestamp()
    };

    const docRef = await addDoc(collection(db, 'notifications'), notificationPayload);
    console.log('[NotificationService] Dispatched push alert document:', docRef.id);

    return { success: true, id: docRef.id, payload: notificationPayload };
  } catch (error) {
    console.error('[NotificationService] Failed to dispatch notification:', error);
    throw error;
  }
};

/**
 * Shorthand alias for test notifications
 */
export const dispatchTestNotification = (params) => dispatchNotification({
  ...params,
  type: params.type || NOTIFICATION_TYPES.NEW_TEST,
});

/**
 * Shorthand helper for assignments
 */
export const dispatchAssignmentNotification = (params) => dispatchNotification({
  ...params,
  type: NOTIFICATION_TYPES.NEW_ASSIGNMENT,
});

/**
 * Shorthand helper for study materials
 */
export const dispatchMaterialNotification = (params) => dispatchNotification({
  ...params,
  type: NOTIFICATION_TYPES.NEW_MATERIAL,
});

/**
 * Shorthand helper for announcements
 */
export const dispatchAnnouncementNotification = (params) => dispatchNotification({
  ...params,
  type: params.priority === 'urgent' ? NOTIFICATION_TYPES.URGENT_NOTICE : NOTIFICATION_TYPES.NEW_ANNOUNCEMENT,
});
