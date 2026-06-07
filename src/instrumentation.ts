export async function register(): Promise<void> {
  // The expenses scheduler is started from Node-only expense API routes.
  // Keeping instrumentation empty avoids bundling better-sqlite3/sharp into
  // the edge compiler when middleware is present.
}
