# OpenTeam CLI

OpenTeam CLI lets local agents control an OpenTeam browser extension through a local daemon.

## Install

```bash
npm install -g @openteam/cli
openteamcli doctor
```

## Development Install

Run from this package directory:

```bash
npm install -g .
# or
npm link
```

## Publish Checklist

```bash
npm pack --dry-run
npm pack
npm publish --access public
```

For a beta release:

```bash
npm publish --tag beta --access public
```
