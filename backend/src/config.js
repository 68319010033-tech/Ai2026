export const CONFIG = {
  port: Number(process.env.PORT || 3000),
  corsOrigin: process.env.CORS_ORIGIN || '*',          // set to your Vite/Cloud URL in production
  frontendDist: process.env.FRONTEND_DIST || '',        // optional: path to Vue `dist/` to serve from Express
  firestorePrefix: process.env.FIRESTORE_PREFIX ?? 'sc_',   // collection prefix: sc_datasets, sc_jobs
  maxUploadMB: Number(process.env.MAX_UPLOAD_MB || 10),
  groupMaxPeriodsPerDay: 7,                             // hard constraint #10
  solver: {
    defaultTimeLimitSec: 30,
    maxTimeLimitSec: 300,
    optimizeShare: 0.15,                                // share of time budget used for soft-constraint improvement
  },
};
export const DAY_ORDER = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
