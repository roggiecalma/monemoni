## Orchestration Policy
- When working on the main orchestrator model, do not write application code or run test suites directly.
- Always delegate code implementation to the `coder` subagent and test authoring/execution to the `tester` subagent, looping up to 3 times until `tester` reports `PASS`.