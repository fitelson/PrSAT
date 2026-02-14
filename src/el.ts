export const el = (name: string, attrs: { [_: string]: string }, ...children: (Node | string)[]) => {
  const element = set_el_attributes(document.createElement(name), attrs)
  for (const child of children) {
    if (child === undefined)
      continue
    if (typeof child === 'string')
      element.append(child)
    else
      element.appendChild(child)
  }
  return element
}

const MATHML_NS = "http://www.w3.org/1998/Math/MathML"

export const math_el = (name: string, attrs: { [_: string]: string }, ...children: (Node | string)[]) => {
  const element = set_math_el_attributes(document.createElementNS(MATHML_NS, name), attrs)
  for (const child of children) {
    if (child === undefined)
      continue
    if (typeof child === 'string')
      element.append(child)
    else
      element.appendChild(child)
  }
  return element
}

export const set_math_el_attributes = (element: MathMLElement, attrs: { [_: string]: string }) => {
  for (const key in attrs)
    element.setAttribute(key, attrs[key])
  return element
}

export const set_el_attributes = (element: HTMLElement, attrs: { [_: string]: string }) => {
  for (const key in attrs)
    element.setAttribute(key, attrs[key])
  return element
}

export const tel = (test_id: string, name: string, attrs: Record<string, string>, ...children: (Node | string)[]): HTMLElement => {
  return el(name, { ...attrs, 'data-testid': test_id }, ...children)
}
