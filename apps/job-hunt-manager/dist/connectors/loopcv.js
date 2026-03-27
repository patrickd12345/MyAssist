export async function fetchLoopCvJobs() {
    if (process.env.JOB_HUNT_LOOPCV_ENABLED !== "true") {
        return [];
    }
    /* LoopCV integration: add official API when credentials are available */
    return [];
}
