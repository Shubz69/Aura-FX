# Community moderation bot

Server-side checks run **before** a community message is stored (`api/community/channels/messages.js`).

## What exists today

| Piece | Purpose |
|--------|--------|
| `rules.default.js` | Rule list: privileged roles, allowlisted domains, link defaults, regex `patternRules`. **Edit this** (or replace) when you send your official rules. |
| `engine.js` | Evaluates message + sender role → `allowed` / `violations` (no DB). |
| `penalties.js` | Writes `community_moderation_strikes`, negative `xp_events`, updates `users.xp` / `users.level`. |

## Behaviour

- **ADMIN** and **SUPER_ADMIN** skip automated moderation (links + patterns). Adjust `privilegedRoles` in `rules.default.js` if you want moderators included or stricter behaviour.
- **Everyone else**: any URL/host not in `allowedLinkHosts` is blocked (`unauthorized_link`). Common promo phrases are matched by `patternRules`.
- **Strikes + XP** are applied when a message is blocked (message is **not** saved).
- Set `COMMUNITY_MODERATION_ENABLED=false` in env to disable checks (engine errors also fail open so chat keeps working).

## Your next step

Send the full rule list: we’ll map each item to `patternRules` entries (or extra policy types in `engine.js` if needed).
