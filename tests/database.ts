import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
export const dir = mkdtempSync(join(tmpdir(), "paypilot-test-"));
process.env.DATABASE_URL = "file:" + join(dir, "test.db");
delete process.env.OPENAI_API_KEY;
