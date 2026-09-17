// 日記一覧の検索まわりの共通処理。一覧の絞り込みと本文のハイライトで同じ正規化を使う。

/** 正規化済み文字列と、「正規化後の位置 -> 元文字列の位置」の対応表。 */
interface Normalized {
  text: string;
  map: number[];
}

/**
 * NFKC 正規化 + 小文字化。大文字小文字と全角半角の違いを吸収する。
 * ハイライト時に元の位置へ戻す必要があるため、1文字ずつ変換して対応表を作る。
 */
function normalize(src: string): Normalized {
  let text = '';
  const map: number[] = [];
  for (let i = 0; i < src.length; i++) {
    const converted = src[i].normalize('NFKC').toLowerCase();
    text += converted;
    for (let j = 0; j < converted.length; j++) map.push(i);
  }
  return { text, map };
}

/** 入力欄の文字列を検索語の配列にする（空白区切り = AND、空語は捨てる）。 */
export function parseQuery(query: string): string[] {
  return normalize(query)
    .text.split(/\s+/)
    .filter((t) => t !== '');
}

/** すべての語が、いずれかの haystack に部分一致するか（語が0個なら true）。 */
export function matchesAll(haystacks: string[], terms: string[]): boolean {
  if (terms.length === 0) return true;
  // haystack の正規化を語ごとに繰り返さないよう、先に1回だけ正規化しておく。
  const normalizedHaystacks = haystacks.map((h) => normalize(h).text);
  return terms.every((t) => normalizedHaystacks.some((h) => h.includes(t)));
}

/** 元文字列上のヒット範囲 [start, end) を、重なりをマージして昇順で返す。 */
export function findRanges(src: string, terms: string[]): [number, number][] {
  if (terms.length === 0) return [];
  const { text, map } = normalize(src);
  const ranges: [number, number][] = [];
  for (const term of terms) {
    if (term === '') continue;
    let from = 0;
    for (;;) {
      const i = text.indexOf(term, from);
      if (i === -1) break;
      const start = map[i];
      const end = (map[i + term.length - 1] ?? src.length - 1) + 1;
      ranges.push([start, end]);
      from = i + term.length;
    }
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const [start, end] of ranges) {
    const last = merged[merged.length - 1];
    if (last && start <= last[1]) {
      last[1] = Math.max(last[1], end);
    } else {
      merged.push([start, end]);
    }
  }
  return merged;
}

/** ローカルタイム（=JST）基準の YYYY-MM-DD。一覧の日付表示と日付検索に共用する。 */
export function dateKey(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
