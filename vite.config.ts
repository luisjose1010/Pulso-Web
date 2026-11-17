import {defineConfig} from 'vite';
import tailwindcss from '@tailwindcss/vite';
import {licenseGuard} from './scripts/third-party-notices.mjs';
export default defineConfig({plugins:[tailwindcss(),licenseGuard()],worker:{plugins:()=>[licenseGuard()]},build:{rolldownOptions:{input:['index.html','pilot.html','samples.html']}}});
