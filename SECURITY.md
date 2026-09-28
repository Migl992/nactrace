# Security

nactrace reads public chain data and never handles keys or signs anything. The main risks are supply-chain (the published npm packages) and the embeddable widget rendering untrusted chain data into a host page.

**Reporting.** Please do not open a public issue for a vulnerability. Use GitHub's private vulnerability reporting on this repository ("Security" tab, "Report a vulnerability"). You will get an acknowledgement within a few days.

**Scope.** `@nactrace/core`, `nactrace` (CLI), `@nactrace/hooks`, `@nactrace/widget`, the scripts in this repository.

**Widget note.** Everything the widget prints comes from chain data and is HTML-escaped before insertion; the widget lives in a shadow root and never evaluates chain data. If you find a way around that, it is a security issue.

**Supported versions.** The latest published minor version.
