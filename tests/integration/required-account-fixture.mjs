/** Explicit TESTONLY account for musical UI suites. Authentication/gating is
 * tested independently by check-account-context-main with real HTTP cookies. */
export async function installRequiredAccountFixture(context,origin){
 const user={id:'11111111-1111-4111-8111-111111111111',name:'Persona TESTONLY',email:'fixture@example.test',emailVerified:true};
 await context.route(origin+'/account-config.json',r=>r.fulfill({json:{version:1,enabled:true,google:false}}));
 await context.route(origin+'/api/account-auth/get-session',r=>{const now=new Date().toISOString();return r.fulfill({json:{user,session:{id:'TESTONLY',token:'TESTONLY',userId:user.id,expiresAt:new Date(Date.now()+3600000).toISOString(),createdAt:now,updatedAt:now}}});});
 await context.route(origin+'/api/account-profile',r=>r.fulfill({json:{accountId:user.id,telegramPhone:null,revision:null}}));
}
