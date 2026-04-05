# Clarification Notes

## Item 1: Runtime wrapper for a browser-only app

### What was unclear
The prompt defines a browser SPA with in-browser logic only, while the repo rulebook defaults many web projects toward a Docker-first runtime.

### Interpretation
This app does not need a server-side backend for core behavior, but it still needs a stable documented runtime command for local review.

### Decision
Use a Svelte SPA served locally for development/review, with `./run_app.sh` as the primary runtime wrapper and `./run_tests.sh` as the broad test wrapper.

### Why this is reasonable
It stays faithful to the prompt's browser-only architecture while still satisfying the repo's requirement for one primary runtime command and one primary broad test command.

## Item 2: Initial authentication bootstrap

### What was unclear
The prompt requires local username/password authentication and several roles, but it does not specify how the first administrator account is created in a local-only system.

### Interpretation
The app needs a secure first-run bootstrap path that avoids committed credentials.

### Decision
Provide a first-run setup flow that creates the initial Administrator account locally; subsequent users and role assignments are managed from Org Admin.

### Why this is reasonable
This avoids hardcoded secrets, fits the local-only requirement, and supports the requested role-based workspace.

## Item 3: Offer approval routing defaults

### What was unclear
Recruiters must route offers for approval, but the approving authority and fallback behavior are not specified.

### Interpretation
Approval should be role-based and visible in the recruiting workflow instead of being hidden or implied.

### Decision
Make offers route to an HR Manager approver by default, with the approval assignee and each workflow transition visible in-product and recorded in the audit trail.

### Why this is reasonable
It preserves the required approval workflow, matches the listed roles, and keeps the behavior reviewable without inventing extra authority paths.

## Item 4: Conversation panel scope and attachment model

### What was unclear
The prompt requires an in-app conversation panel with context history and local search, but it does not define whether threads are global or tied to specific workflows.

### Interpretation
Users need both a workspace-wide inbox feel and context-specific history tied to merchants, bookings, candidates, offers, and org records.

### Decision
Implement conversations so users can view contextual history from the active merchant, booking, recruiting, or org workflow while still being able to search locally across messages by keyword and date range.

### Why this is reasonable
This supports the collaboration requirements without narrowing the product to one fixed thread model or inventing an external messaging system.
