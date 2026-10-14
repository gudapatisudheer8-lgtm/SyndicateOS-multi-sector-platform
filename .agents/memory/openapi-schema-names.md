---
name: OpenAPI request schema names
description: Avoid generated Zod model and validator export collisions in the shared API packages.
---

Use distinctly named component schemas for JSON request bodies rather than relying on operation-derived inline body names.

**Why:** This project's generator exports both Zod validators and TypeScript models through the same public barrel. Inline body names can collide with validator names, so successful generation alone does not mean the generated libraries compile.

**How to apply:** When adding JSON operations, reference a named request component and run the code-generation command including its shared-library typecheck. Fix the specification, not generated files.
