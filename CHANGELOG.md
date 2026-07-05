# Changelog

All notable changes to this project are documented in this file. The format is
based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this
project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Project documentation set: `README.md`, `ARCHITECTURE.md`, `docs/DEVELOPMENT.md`,
  `docs/DEPLOYMENT.md`, `AGENTS.md`, and MIT `LICENSE`.
- Initial git repository with `main` as the default branch.

### Notes
- Project is pre-1.0. The shared accounting engine and local hot-seat game are
  in place; multiplayer, accrual polish, and classroom UX remain in progress per
  the `PLAN-*.md` phase plans.

## [0.1.0] - YYYY-MM-DD

_First tagged release — not yet cut._

### Added
- pnpm workspace monorepo: `apps/client`, `apps/server`, `packages/shared`.
- Pure TypeScript accounting engine: accounts, journal posting, validation,
  T-account generation, income statement, balance sheet, cash summary.
- Express + Socket.IO server with SQLite persistence and event-sourced game state.
- React + Vite client with board, team dashboard, journal entry form, and
  statement views.
- Cash-basis event deck and simple 24-space board preset.

[Unreleased]: https://example.com/compare/v0.1.0...HEAD
[0.1.0]: https://example.com/releases/tag/v0.1.0
