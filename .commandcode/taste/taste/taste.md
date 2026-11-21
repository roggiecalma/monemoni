# Taste
- Always check the `ScreenShot` folder in the repo root before making UI changes — it holds reference screenshots. Never commit, push, or track that folder in git. Confidence: 0.9
- Prefers minimal form UI: no helper/hint caption text under form fields, just the labels and the controls. Confidence: 0.55
- Avoids redundant text in UI — if information is already conveyed by another visible element (e.g., account type label when account name already includes it), omit the duplicate. Confidence: 0.75
- Prefers compact UI layouts — minimize whitespace/padding in card grids and lists when possible. Confidence: 0.7
- Skips automated security agent/delegation in the orchestrator loop — user prefers to review security audits and vulnerabilities manually. Confidence: 0.85
- Always delegate code implementation to the `coder` subagent and test authoring/execution to the `tester` subagent. Handle only high-level orchestration and final verification (browser, prod build), looping until the tester reports PASS. Confidence: 0.9
