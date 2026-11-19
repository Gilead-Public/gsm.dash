declare module 'virtual:gsm/validate-study-document' {
  const validate: ((data: unknown) => boolean) & { errors?: import('ajv').ErrorObject[] | null };
  export default validate;
}

declare module 'virtual:gsm/validate-portfolio-document' {
  const validate: ((data: unknown) => boolean) & { errors?: import('ajv').ErrorObject[] | null };
  export default validate;
}
