# Coding Taste

- Prefer small, pure helper functions with early returns over deep nesting.
- Handle errors explicitly with clear context rather than swallowing exceptions silently.
- Keep new test cases focused, deterministic, and aligned with existing test structure.
- Prefers raw SQL files for database migrations over CLI wrappers or ORM push commands; specifically likes outputs ready to paste directly into the Turso web console. Confidence: 0.7
