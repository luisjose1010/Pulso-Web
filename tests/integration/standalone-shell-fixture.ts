// Ephemeral loopback data only. No Telegram client, key, code or real account.
import './legacy-shell-fixture';
import {sessionLease,saveTelegramSession} from '../../src/telegram/saved-session';
Object.assign(window,{seedStandalone:async()=>{
 await (window as unknown as {setupCollectionFixture:()=>Promise<void>}).setupCollectionFixture();
 const lease=await sessionLease();if(!await saveTelegramSession(lease,'TESTONLY_STANDALONE_AUTHORIZATION'))throw Error('test vault');
 localStorage.setItem('testonly-standalone-marker','retained');
}});
