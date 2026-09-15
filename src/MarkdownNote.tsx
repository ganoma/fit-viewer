import { memo, useMemo } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import { findRanges } from './diarySearch';

// hast の最小限の型。@types/hast は react-markdown の推移的依存なので、直接 import せずここで定義する。
interface HastNode {
  type: string;
  value?: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
}

/** テキストノード1つを、ヒット範囲で text / mark / text … に割る。 */
function splitText(value: string, terms: string[]): HastNode[] {
  const ranges = findRanges(value, terms);
  if (ranges.length === 0) return [{ type: 'text', value }];
  const out: HastNode[] = [];
  let pos = 0;
  for (const [start, end] of ranges) {
    if (start > pos) out.push({ type: 'text', value: value.slice(pos, start) });
    out.push({
      type: 'element',
      tagName: 'mark',
      properties: { className: ['diary-hit'] },
      children: [{ type: 'text', value: value.slice(start, end) }],
    });
    pos = end;
  }
  if (pos < value.length) out.push({ type: 'text', value: value.slice(pos) });
  return out;
}

/** 子ノードを再帰的に走査し、テキストノードだけ差し替える。要素の構造には触らない。 */
function walk(node: HastNode, terms: string[]): void {
  if (!node.children) return;
  const out: HastNode[] = [];
  for (const child of node.children) {
    if (child.type === 'text' && typeof child.value === 'string') {
      out.push(...splitText(child.value, terms));
    } else {
      walk(child, terms);
      out.push(child);
    }
  }
  node.children = out;
}

/** 整形済みツリーのヒット語を <mark> に差し替える rehype プラグイン。 */
function createHighlightPlugin(terms: string[]) {
  return () => (tree: HastNode) => walk(tree, terms);
}

/** 日記本文の整形表示。terms が空配列ならハイライトなし。 */
export default memo(function MarkdownNote({
  source,
  terms,
}: {
  source: string;
  terms: string[];
}) {
  // 検索語が無いときはツリー走査ごと省く。
  const rehypePlugins = useMemo(
    () => (terms.length > 0 ? [createHighlightPlugin(terms)] : []),
    [terms],
  );
  return (
    <div className="diary-body">
      <Markdown remarkPlugins={[remarkGfm, remarkBreaks]} rehypePlugins={rehypePlugins}>
        {source}
      </Markdown>
    </div>
  );
});
