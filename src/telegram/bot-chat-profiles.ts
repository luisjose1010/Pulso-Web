/** Curated first-use defaults and manual suggestions. Profile checks never send messages. */
export const PULSO_BOT_SUGGESTIONS:readonly string[]=Object.freeze(['KDMusic_Bot','DeezerMusicBot']);

/** Historical study metadata, not the application's current suggestions. */
export const BOT_CHAT_SUGGESTIONS:readonly string[]=Object.freeze(['ivkmbot','LyDBot']);
export const BOT_CHAT_PROFILES=Object.freeze([
 Object.freeze({username:'ivkmbot',version:1,status:'NO_VERIFICADO' as const,queryGenerationEnabled:false as const}),
 Object.freeze({username:'LyDBot',version:1,status:'NO_VERIFICADO' as const,queryGenerationEnabled:false as const}),
]);
