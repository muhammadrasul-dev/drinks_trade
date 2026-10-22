// Runs in each test worker before the test file is imported: @drinks/db's
// client reads DATABASE_URL when first imported, so point it at the test DB.
import { testDatabaseUrl } from './env';

process.env.DATABASE_URL = testDatabaseUrl();
