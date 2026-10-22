// Migrates the test database (shared kit, packages/db/test-utils), so this
// suite also runs on its own, without @drinks/db's test:int first.
export { default } from '@drinks/db/test-utils/global-setup';
