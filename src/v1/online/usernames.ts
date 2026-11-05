/** Login names (user decision 2026-11-05): the player's name in lower case, except Kamil Reis → kamil, M.Emre → emre, Ali Efe → aliefe,
 * Arda Barin → barin, Hakan Göktuğ → hakan, Yiğit Çetinkaya → yiğit, Eren Emeksiz → erenemeksiz (eren is Eren's). The admin account
 * ("admin") is separate. The first password is the name followed by "!"; everyone changes it at first login. */
export const USERNAME_OVERRIDES: Readonly<Record<string, string>> = {
  'kamil-reis': 'kamil', 'm-emre': 'emre', 'ali-efe': 'aliefe', 'arda-barin': 'barin', 'hakan-goktug': 'hakan', 'yigit-cetinkaya': 'yiğit', 'eren-emeksiz': 'erenemeksiz',
};
/** Turkish lower case without relying on the runtime's locale data (İ → i, I → ı). */
const lowerTr = (value: string) => value.replace(/İ/g, 'i').replace(/I/g, 'ı').toLowerCase();
export const usernameFor = (player: { readonly id: string; readonly name: string }) => USERNAME_OVERRIDES[player.id] ?? lowerTr(player.name).replace(/[\s.]/g, '');
/** What a login is matched on: capitals, Turkish letters, spaces and dots do not matter (phones capitalise the first letter). */
export function loginKey(value: string): string {
  return lowerTr(value.trim()).replace(/ı/g, 'i').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
}
/** The first password typed any way ("Göktuğ!", "goktug!") reduced to what was stored ("goktug!"). */
export const firstPasswordKey = (typed: string) => `${loginKey(typed)}${typed.trim().endsWith('!') ? '!' : ''}`;
export const firstPassword = (username: string) => `${loginKey(username)}!`;
