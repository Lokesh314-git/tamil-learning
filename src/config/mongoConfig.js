/**
 * MongoDB Atlas & GridFS Configuration for Tamil Learning Platform
 * Cluster: cluster0.qfdmujt.mongodb.net
 * Database: tamil_learning
 */

export const MONGO_CONFIG = {
  clusterHost: 'cluster0.qfdmujt.mongodb.net',
  appName: 'Cluster0',
  databaseName: 'tamil_learning',
  bucketName: 'study_materials_files',
  apiBaseUrl: 'https://us-central1-tamil-learning-2d773.cloudfunctions.net/api',
  collections: {
    students: 'students',
    studyMaterials: 'study_materials',
    units: 'units',
    tests: 'tests',
    quizzes: 'quizzes',
    assignments: 'assignments',
    announcements: 'announcements',
    notifications: 'notifications',
    submissions: 'submissions',
    auditLogs: 'audit_logs',
    downloads: 'downloads',
    documents: 'documents',
    feedback: 'feedback',
  },
  endpoints: {
    upload: 'https://us-central1-tamil-learning-2d773.cloudfunctions.net/api/materials/upload',
    materials: 'https://us-central1-tamil-learning-2d773.cloudfunctions.net/api/materials',
    download: 'https://us-central1-tamil-learning-2d773.cloudfunctions.net/api/materials/download',
    status: 'https://us-central1-tamil-learning-2d773.cloudfunctions.net/api/materials/status',
    migrate: 'https://us-central1-tamil-learning-2d773.cloudfunctions.net/api/materials/migrate',
  }
};

export default MONGO_CONFIG;
