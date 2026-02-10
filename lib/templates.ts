type TemplateContext = Record<string, string | number | boolean | null | undefined>;

export function renderTemplate(template: string | null | undefined, context: TemplateContext): string {
  if (!template) {
    return "";
  }

  return template.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_, key: string) => {
    const value = context[key];
    return value === null || value === undefined ? "" : String(value);
  });
}
