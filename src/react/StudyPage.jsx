import { useEffect } from 'react';

/** @param {{ doc: import('./document.js').StudyDocument }} props */
export function StudyPage({ doc }) {
  const { StudyID, params, snapshots } = doc.study;
  useEffect(() => {
    document.title = `${StudyID} · gsm.dash`;
  }, [StudyID]);
  return (
    <main className="report" data-study={StudyID}>
      <h1>
        {StudyID}
        {params.nickname ? ` · ${params.nickname}` : ''}
      </h1>
      <p className="report-meta">
        {snapshots.length} snapshots · latest {[...snapshots].sort().at(-1)}
      </p>
    </main>
  );
}
