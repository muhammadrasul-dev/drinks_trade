// Single repo-wide ESLint config: boundaries are enforced by path, so a new
// package cannot bypass them by forgetting its own lint setup.
import {
  base,
  nodeFiles,
  prettierCompat,
  react,
  sharedBoundaries,
  uiBoundaries,
  webBoundaries,
} from '@drinks/config/eslint';

export default [
  ...base,
  ...nodeFiles(['*.{js,mjs,cjs}', 'packages/{config,server,db}/**/*.{js,mjs,cjs,ts,tsx,mts,cts}']),
  ...webBoundaries(),
  ...sharedBoundaries(),
  ...uiBoundaries(),
  ...react({
    files: ['{apps/web,packages/ui}/**/*.{ts,tsx}'],
    nextFiles: ['apps/web/**/*.{js,jsx,mjs,ts,tsx,mts}'],
    nextRootDir: 'apps/web/',
  }),
  ...prettierCompat,
];
