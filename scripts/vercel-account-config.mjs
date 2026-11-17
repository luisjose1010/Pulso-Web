// Vercel has no account service (Neon/Better Auth live in the Cloudflare Worker).
// `local:true` makes the app run as one fixed local profile instead of asking for a Pulso account.
import {writeFileSync} from 'node:fs';
writeFileSync('dist/account-config.json', JSON.stringify({version: 1, enabled: false, google: false, local: true}) + '\n');
