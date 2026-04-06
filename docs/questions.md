# Clarification Questions

## Business Logic Questions Log

### 1. Runtime Wrapper for a Browser-Only App
- Question: How should the runtime be structured for a browser-only SPA that still needs a documented launch command?
- My Understanding: The prompt defines a browser SPA with in-browser logic only, while the repo rulebook defaults many web projects toward a Docker-first runtime. The app does not need a server-side backend for core behavior, but it still needs a stable documented runtime command for local review.
- Solution: Use a Svelte SPA served locally for development/review, with `./run_app.sh` as the primary runtime wrapper and `./run_tests.sh` as the broad test wrapper. This stays faithful to the prompt's browser-only architecture while satisfying the repo's requirement for one primary runtime command and one primary broad test command.

### 2. Initial Authentication Bootstrap
- Question: How should the first administrator account be created in a local-only system?
- My Understanding: The prompt requires local username/password authentication and several roles, but it does not specify how the first administrator account is created. The app needs a secure first-run bootstrap path that avoids committed credentials.
- Solution: Provide a first-run setup flow that creates the initial Administrator account locally; subsequent users and role assignments are managed from Org Admin. This avoids hardcoded secrets, fits the local-only requirement, and supports the requested role-based workspace.

### 3. Offer Approval Routing Defaults
- Question: Who should offers route to for approval, and what should the fallback behavior be?
- My Understanding: Recruiters must route offers for approval, but the approving authority and fallback behavior are not specified. Approval should be role-based and visible in the recruiting workflow instead of being hidden or implied.
- Solution: Make offers route to an HR Manager approver by default, with the approval assignee and each workflow transition visible in-product and recorded in the audit trail. This preserves the required approval workflow, matches the listed roles, and keeps the behavior reviewable without inventing extra authority paths.

### 4. Conversation Panel Scope and Attachment Model
- Question: Should conversation threads be global or tied to specific workflows?
- My Understanding: The prompt requires an in-app conversation panel with context history and local search, but it does not define whether threads are global or tied to specific workflows. Users need both a workspace-wide inbox feel and context-specific history tied to merchants, bookings, candidates, offers, and org records.
- Solution: Implement conversations so users can view contextual history from the active merchant, booking, recruiting, or org workflow while still being able to search locally across messages by keyword and date range. This supports the collaboration requirements without narrowing the product to one fixed thread model or inventing an external messaging system.
