/**
 * Compatibility layer over routing/route.ts. The URL grammar lives there;
 * this module keeps the legacy `prFileIdx` field for existing callers.
 */

import { parseHash as parseRoute, type HashRoute as Route } from "./routing/route";

export {
  buildRoute,
  buildRepoHash,
  buildBranchHash,
  buildFileHash,
  buildPRHash,
  resolvePRFile,
} from "./routing/route";
export type { FileRef, ResolvedPRFile } from "./routing/route";

export interface HashRoute extends Route {
  prFileIdx?: number;
}

export function parseHash(hash: string): HashRoute {
  const route = parseRoute(hash);
  if (route.file?.kind === "index") {
    const { file, ...rest } = route;
    return { ...rest, prFileIdx: file.index };
  }
  return route;
}
