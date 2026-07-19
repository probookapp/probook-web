export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Fail loudly at boot on a misconfigured production deploy (OPS-7).
    const { assertEnv } = await import("./lib/env");
    assertEnv();

    await import("../sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}

export const onRequestError = async (...args: Parameters<NonNullable<typeof import("@sentry/nextjs").captureRequestError>>) => {
  const { captureRequestError } = await import("@sentry/nextjs");
  captureRequestError(...args);
};
