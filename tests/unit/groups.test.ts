import {unknownLocalAlbum} from '../../src/library/album-metadata.ts';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {Track} from '../../src/library/library.ts';
import {groupArtists, groupAlbums, selectGroup, getGroupTracks} from '../../src/library/groups.ts';

function track(id: string, patch: Partial<Track> = {}): Track {
 return {id, assetId: `asset-${id}`, title: 'Canción', artist: 'Artista', album: 'Álbum',
  duration: 60, favorite: false, revision: 1, createdAt: '2026-10-31', manualOverrides: {}, ...patch};
}

test('empty library has no fabricated groups and missing selection stays missing', () => {
 assert.deepEqual(groupArtists([]), []);
 assert.deepEqual(groupAlbums([]), []);
 assert.equal(selectGroup([], 'missing'), undefined);
 assert.equal(selectGroup([], null), undefined);
});

test('NFC identity preserves all original presentations for artists and albums', () => {
 const tracks = [track('a', {artist: 'Cafe\u0301', album: 'A\u0301lbum'}),
  track('b', {artist: 'Café', album: 'Álbum'})];
 const [artist] = groupArtists(tracks);
 const [album] = groupAlbums(tracks);
 assert.equal(groupArtists(tracks).length, 1);
 assert.equal(groupAlbums(tracks).length, 1);
 assert.equal(artist.label, 'Cafe\u0301');
 assert.deepEqual(artist.labels, ['Cafe\u0301', 'Café']);
 assert.deepEqual(album.labels, ['A\u0301lbum', 'Álbum']);
 assert.deepEqual(album.artistLabels, ['Cafe\u0301', 'Café']);
 assert.equal(album.key, groupAlbums([...tracks].reverse())[0].key);
});

test('case, similar names, compatibility characters and joint artist strings stay distinct', () => {
 const names = ['Artist', 'artist', 'Artíst', 'Ａrtist', 'Artist A;B', 'Artist A', 'B', ' Artist '];
 const groups = groupArtists(names.map((artist, i) => track(String(i), {artist})));
 assert.equal(groups.length, names.length);
 assert.deepEqual(groups.map(group => group.label), names);
 assert.equal(new Set(groups.map(group => group.key)).size, names.length);
});

test('albums require equivalent title and credit and keys cannot collide by delimiters', () => {
 const tracks = [track('a'), track('b', {artist: 'Otro'}), track('c', {album: 'Álbum (Deluxe)'}),
  track('d', {artist: null}), track('e', {album: 'a|b', artist: 'c'}),
  track('f', {album: 'a', artist: 'b|c'})];
 const groups = groupAlbums(tracks);
 assert.equal(groups.length, tracks.length);
 assert.equal(new Set(groups.map(group => group.key)).size, tracks.length);
 assert.equal(groups[3].artist, null);
 assert.equal(groups[3].unknown, false);
 assert.ok(groups.every(group => group.completeness === 'unknown'));
});

test('null, empty and whitespace use explicit buckets distinct from literal placeholder names', () => {
 const tracks = [track('a', {artist: null, album: null}), track('b', {artist: '', album: ''}),
  track('c', {artist: ' \t', album: '\n'}),
  track('d', {artist: 'Artista desconocido', album: 'Sin álbum (agrupación local)'}),
  track('e', {artist: 'Otro', album: null})];
 const artists = groupArtists(tracks);
 const albums = groupAlbums(tracks);
 assert.deepEqual(artists[0].trackIds, ['a', 'b', 'c']);
 assert.deepEqual(albums[0].trackIds, ['a', 'b', 'c', 'e']);
 assert.equal(artists[0].label, 'Artista desconocido');
 assert.equal(albums[0].label, 'Sin álbum (agrupación local)');
 assert.equal(albums[0].unknown, true);
 assert.equal(albums[1].unknown, false);
 assert.notEqual(albums[0].key, albums[1].key);
 assert.deepEqual(artists[0].provenance, []);
});

test('provenance is field-specific, includes manual clearing and ignores title overrides', () => {
 const tracks = [track('a'), track('b', {manualOverrides: {artist: 'Artista'}}),
  track('c', {manualOverrides: {album: 'Álbum'}}),
  track('d', {manualOverrides: {title: 'Canción'}})];
 const [album] = groupAlbums(tracks);
 assert.deepEqual(album.evidence, {artist: ['tags', 'manual'], album: ['tags', 'manual']});
 assert.deepEqual(album.provenance, ['tags', 'manual']);
 assert.deepEqual(groupArtists([tracks[2], tracks[3]])[0].provenance, ['tags']);
 const [cleared] = groupAlbums([track('e', {album: null, artist: null, manualOverrides: {album: null}})]);
 assert.deepEqual(cleared.evidence, {artist: [], album: ['manual']});
 assert.equal(cleared.unknown, true);
});

test('equal titles, remixes, different assets and shared assets retain Track identities', () => {
 const tracks = [track('original'), track('remix'), track('another', {assetId: 'asset-original'})];
 const [group] = groupAlbums(tracks);
 assert.deepEqual(group.trackIds, ['original', 'remix', 'another']);
 assert.deepEqual(getGroupTracks(tracks, group), tracks);
 assert.equal(group.completeness, 'unknown');
});

test('group and track order follows input while keys survive reorder and unrelated additions', () => {
 const a = track('a');
 const b = track('b', {artist: 'Otro'});
 const c = track('c');
 for (const grouping of [groupArtists, groupAlbums]) {
  const groups = grouping([a, b, c]);
  const reordered = grouping([c, b, a, track('d', {artist: 'Nuevo'})]);
  assert.deepEqual(groups.map(group => group.trackIds), [['a', 'c'], ['b']]);
  assert.deepEqual(selectGroup(reordered, groups[0].key)?.trackIds, ['c', 'a']);
  assert.equal(selectGroup(reordered, groups[1].key)?.key, groups[1].key);
 }
});

test('selection intersects IDs with current playlist order and preserves repeated input occurrences', () => {
 const a = track('a');
 const b = track('b');
 const other = track('other', {artist: 'Otro'});
 const [group] = groupArtists([a, b, a]);
 assert.deepEqual(group.trackIds, ['a', 'b', 'a']);
 assert.deepEqual(getGroupTracks([b, other, a, a], group), [b, a, a]);
 assert.deepEqual(getGroupTracks([a], group), [a]);
 assert.deepEqual(getGroupTracks([], group), []);
});

test('metadata revision changes views without mutating frozen input or previous snapshots', () => {
 const original = track('a');
 Object.freeze(original.manualOverrides);
 Object.freeze(original);
 const tracks = Object.freeze([original]);
 const before = JSON.stringify(tracks);
 const artists = groupArtists(tracks);
 const albums = groupAlbums(tracks);
 const edited = {...original, artist: 'Corregido', revision: 2, manualOverrides: {artist: 'Corregido'}};
 const revisedArtists = groupArtists([edited]);
 const revisedAlbums = groupAlbums([edited]);
 assert.equal(selectGroup(revisedArtists, artists[0].key), undefined);
 assert.equal(selectGroup(revisedAlbums, albums[0].key), undefined);
 assert.deepEqual(revisedArtists[0].provenance, ['manual']);
 assert.equal(revisedAlbums[0].artist, 'Corregido');
 assert.equal(artists[0].label, 'Artista');
 assert.equal(getGroupTracks(tracks, albums[0])[0], original);
 assert.equal(JSON.stringify(tracks), before);
 assert.deepEqual(revisedAlbums[0].trackIds, ['a']);
});

function albumSource(artist: string | null, compilation: boolean | null = null): Track['localAlbum'] {
 const metadata = unknownLocalAlbum('absent');
 if (artist !== null) metadata.source.albumArtist = {state:'known', value:artist, evidence:{kind:'embedded-id3', tag:'TPE2'}};
 if (compilation !== null) metadata.source.compilation = {state:'known', value:compilation, evidence:{kind:'embedded-id3', tag:'TCMP'}};
 return metadata;
}

test('stored album variants merge by presentation without changing tracks or embedded evidence', () => {
 const tracks = [track('sisifo', {artist:'NSQK', album:'SÍSIFO / NADIE MÁS!', localAlbum:albumSource('NSQK', false)}),
  track('nadie', {artist:' Nsqk ', album:' síSiFO /  NADIE MÁS! '})];
 const before = JSON.stringify(tracks);
 for (const input of [tracks, [...tracks].reverse()]) {
  const groups = groupAlbums(input);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].trackIds, input.map(t => t.id));
  assert.equal(groups[0].criterion, 'albumArtist');
  assert.deepEqual(groups[0].albumArtistSource, tracks[0].localAlbum!.source.albumArtist);
  assert.deepEqual(groups[0].labels, input.map(t => t.album));
  assert.deepEqual(groups[0].artistLabels, input.map(t => t.artist));
  assert.deepEqual(getGroupTracks(input, groups[0]), input);
 }
 assert.equal(JSON.stringify(tracks), before);
 assert.equal(groupAlbums(tracks)[0].key, groupAlbums([...tracks].reverse())[0].key);
});

test('album grouping keeps distinct credits, punctuation, editions and unknown artists apart', () => {
 const tracks = [track('a', {artist:'NSQK'}), track('b', {artist:'Nsqk feat. Otro'}),
  track('c', {artist:'Otro'}), track('d', {artist:null}), track('e', {artist:'NSQK', album:'Álbum (Deluxe)'}),
  track('f', {artist:'NSQK', album:'Album'}), track('g', {artist:'NSQK', album:'Álbum!'})];
 assert.equal(groupAlbums(tracks).length, tracks.length);
 const sameTitle = [track('h', {artist:'NSQK', localAlbum:albumSource('Otro')}), tracks[0]];
 assert.equal(groupAlbums(sameTitle).length, 2);
});

test('compilation conflicts remain separate and missing flags never bridge an ambiguous pair', () => {
 const yes = track('yes', {localAlbum:albumSource('Artista', true)});
 const no = track('no', {localAlbum:albumSource('Artista', false)});
 const missing = track('missing');
 for (const input of [[yes,no,missing], [missing,no,yes]]) {
  assert.equal(groupAlbums(input).length, 3);
  assert.deepEqual(groupAlbums(input).map(g => g.trackIds), input.map(t => [t.id]));
  const keys = new Map(groupAlbums(input).map(g => [g.trackIds[0], g.key]));
  assert.deepEqual(new Map(groupAlbums([...input].reverse()).map(g => [g.trackIds[0], g.key])), keys);
 }
 assert.equal(groupAlbums([missing,no]).length, 1);
 assert.equal(groupAlbums([yes,missing]).length, 1);
 const fallbackFlag = track('fallback', {localAlbum:albumSource(null, false)});
 assert.equal(groupAlbums([yes,fallbackFlag]).length, 2);
});
