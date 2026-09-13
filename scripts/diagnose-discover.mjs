#!/usr/bin/env node
// Local operator tool. Credentials stay in the environment; output contains no personal text.
import { runOperator } from './_operator.mjs';
await runOperator('discover');
