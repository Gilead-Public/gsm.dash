/** @param {{ errors: string[] }} props */
export function ErrorState({ errors }) {
  return (
    <main className="report-error" role="alert">
      <h1>This report can't be shown</h1>
      <p>Its data doesn't match the study document schema, so no values are shown.</p>
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
