/** Tiny DOM helpers so the editor stays dependency-free. */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> & { className?: string } = {},
  children: (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  Object.assign(node, props);
  for (const child of children) node.append(child);
  return node;
}

export function select(options: readonly string[], value: string, onChange: (value: string) => void): HTMLSelectElement {
  const node = el('select');
  for (const option of options) node.append(el('option', { value: option, textContent: option || '—' }));
  node.value = value;
  node.addEventListener('change', () => onChange(node.value));
  return node;
}

export function field(label: string, control: HTMLElement): HTMLElement {
  return el('label', { className: 'field' }, [el('span', { textContent: label }), control]);
}
