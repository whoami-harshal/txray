/** Rename the app here: everything else reads from this. */
export const SITE = {
  name: "TxRay",
  tagline: "X-ray your Solana transactions.",
  description:
    "Free Solana transaction checkup: failure rate, why transactions fail, fees and compute waste for any program or wallet.",
  /** Optional: shown in the footer when set */
  githubUrl: process.env.NEXT_PUBLIC_GITHUB_URL || null,
  xUrl: process.env.NEXT_PUBLIC_X_URL || null,
} as const;
