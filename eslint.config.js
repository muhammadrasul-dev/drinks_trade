// Single repo-wide ESLint config: boundaries are enforced by path, so a new
// package cannot bypass them by forgetting its own lint setup.
import {
  base,
  nodeFiles,
  prettierCompat,
  sharedBoundaries,
  webBoundaries,
} from '@drinks/config/eslint';

export default [
  ...base,
  ...nodeFiles(['*.{js,mjs,cjs}', 'packages/{config,server,db}/**/*.{js,mjs,cjs,ts,mts,cts}']),
  ...webBoundaries(),
  ...sharedBoundaries(),
  ...prettierCompat,
];
