/** Read a required server env var, with a clear error when it's missing. */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env var ${name} (see .env.example)`);
  return value;
}
