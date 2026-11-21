// @ts-check
// The study page's grouped layout: the CTQ cards by category, then the KRI groups, each with its own expand control.
// Unwired since the 19 Nov design review, which orders cards by layout only and leaves grouping for later (#35); kept
// for when grouping returns. StudyPage would render it in place of the flat grid when `store.state.groupByCategory`.
import { useState } from 'react';
import { STUDY_PAGE_SPEC } from '../app/study-page-spec.js';
import { kriLayout } from '../app/kri-groups.js';

/** @typedef {import('../app/study-cards.js').Card} Card */

/** @param {{ cards: Card[], renderCard: (card: Card) => any }} props */
export function GroupedCards({ cards, renderCard }) {
  const [expanded, setExpanded] = useState(() => /** @type {Set<string>} */ (new Set()));
  /** @type {Map<string, Card[]>} */
  const rows = new Map(STUDY_PAGE_SPEC.rows.map((/** @type {string} */ row) => [row, []]));
  for (const card of cards.filter((c) => !c.kri)) {
    const category = card.metric?.Category;
    const row = rows.has(category) ? category : STUDY_PAGE_SPEC.otherRow;
    rows.set(row, [...(rows.get(row) ?? []), card]);
  }
  const kriCards = cards.filter((c) => c.kri && c.metric);
  const { groups } = kriLayout([...new Set(kriCards.map((c) => c.metric))]);
  const cardsOf = (/** @type {any[]} */ metrics) => metrics.flatMap((m) => kriCards.filter((c) => c.metric === m));
  return (
    <>
      {[...rows]
        .filter(([, list]) => list.length)
        .map(([row, list]) => (
          <div className="dd-row" data-row={row} key={row}>
            <div className="rowlab">{`${row} · ${list.length}`}</div>
            <div className="tiles">{list.map(renderCard)}</div>
          </div>
        ))}
      {groups.map((g) => {
        const open = expanded.has(g.id);
        const members = cardsOf(open ? g.members : g.shown);
        return (
          <div className="dd-row kri-group" data-row={g.label} data-kri-group={g.id} key={g.id}>
            <div className="rowlab">{`${g.label} · ${members.length}`}</div>
            <div className="tiles">
              {members.map(renderCard)}
              {g.hidden.length && !open ? (
                <button type="button" className="kri-more" data-kri-expand={g.id} onClick={() => setExpanded(new Set([...expanded, g.id]))}>
                  Show more
                </button>
              ) : null}
            </div>
          </div>
        );
      })}
    </>
  );
}
