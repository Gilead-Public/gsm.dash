// @ts-check
/** @param {{ errors: string[], kind: 'study' | 'portfolio' }} props */
export function ErrorState({ errors, kind }) {
  return (
    <main className="report-error" role="alert">
      <h1>This report can't be shown</h1>
      <p>Its data doesn't match the {kind} document schema, so no values are shown.</p>
      <ul>
        {errors.slice(0, 10).map((e, i) => (
          <li key={i}>
            <code>{e}</code>
          </li>
        ))}
      </ul>
    </main>
  );
}
