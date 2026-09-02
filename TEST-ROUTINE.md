# Test PR — do not merge

Throwaway change to check which automations fire on a pull request:

- CI (`ci.yml`) — `npm run verify`
- Claude review (`claude-review.yml`) — inert until #44 installs the app and
  adds `ANTHROPIC_API_KEY`
- any scheduled routine watching this repo

Delete the branch once observed.
