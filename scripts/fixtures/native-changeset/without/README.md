Fixture: deliberately contains NO changeset.

The parser skips README.md, so this directory reads as empty while still
being tracked by git (which does not store empty directories).
