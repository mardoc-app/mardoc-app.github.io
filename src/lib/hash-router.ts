/** The hash URL contract; the grammar lives in routing/route.ts. */
export {
  parseHash,
  buildRoute,
  buildRepoHash,
  buildBranchHash,
  buildFileHash,
  buildPRHash,
  resolvePRFile,
  sameRoute,
} from "./routing/route";
export type { HashRoute, FileRef, ResolvedPRFile } from "./routing/route";
