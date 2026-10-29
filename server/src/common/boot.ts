/**
 * Runs the boot and exits non-zero if it fails. Sentry's unhandled-rejection handler only warns,
 * so without this a failed boot (Redis down, listen error) would leave a process with no listener
 * that the platform never restarts.
 */
export async function bootOrExit(
  boot: () => Promise<void>,
  exit: (code: number) => void = code => process.exit(code),
  log: (e: unknown) => void = e => console.error(e),
): Promise<void> {
  try {
    await boot()
  } catch (e) {
    log(e)
    exit(1)
  }
}
