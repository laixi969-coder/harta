import {evaluateCreation} from '../evals/creation/provider.mjs';
import {scenarios} from '../evals/creation/fixtures.mjs';

const live = process.argv.includes('--live');
for (const scenario of scenarios) {
  const row=await evaluateCreation(scenario,live);
  console.log(JSON.stringify(row));
  if (![row.retrieved,row.scopeClean,row.exceptionRetained,row.newClaimRetrieved,row.exactRanges].every(Boolean) ||
      (live && (!row.issues.length || row.generatedIssues.length))) process.exitCode=1;
}
