declare module 'virtual:gsm/validate-study-document' {
  const validate: ((data: unknown) => boolean) & { errors?: import('ajv').ErrorObject[] | null };
  export default validate;
}
