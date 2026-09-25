/**
 * Support numbered decks with explicit previous/next controls and an active slide.
 * Use their handlers, never edit slide classes or call guessed global functions.
 * Unknown/asynchronous decks retain the normal hidden-target explanation.
 */
export function revealCommentSlide(doc: Document, elements: Element[]): boolean {
  const target = elements[0]?.closest(".slide");
  if (!target || elements.some(element => element.closest(".slide") !== target)) return false;
  const slides = Array.from(doc.querySelectorAll(".slide"));
  const targetIndex = slides.indexOf(target);
  const next = doc.getElementById("next");
  const previous = doc.getElementById("previous");
  const position = doc.getElementById("position");
  if (next?.tagName !== "BUTTON" || previous?.tagName !== "BUTTON" || !position) return false;
  const currentIndex = () => {
    const active = slides.filter(slide => slide.classList.contains("active") && slide.getAttribute("aria-hidden") === "false");
    if (active.length !== 1) return -1;
    const index = slides.indexOf(active[0]);
    const counter = position.textContent?.trim().match(/^(\d+)\s*\/\s*(\d+)$/);
    return counter && Number(counter[1]) === index + 1 && Number(counter[2]) === slides.length ? index : -1;
  };
  let current = currentIndex();
  if (current < 0) return false;
  const direction = targetIndex > current ? 1 : -1;
  const control = (direction > 0 ? next : previous) as HTMLButtonElement;
  // Bound work and verify each handler moved exactly one slide before continuing.
  for (let attempts = 0; current !== targetIndex && attempts < slides.length; attempts++) {
    if (control.disabled || !control.isConnected) return false;
    control.click();
    const updated = currentIndex();
    if (updated !== current + direction) return false;
    current = updated;
  }
  return current === targetIndex;
}

/** Reveal only the numbered template/notes convention used by supported decks. */
export function revealCommentNotes(doc: Document, templateId: string): HTMLElement | null {
  const match = /^notes-([1-9]\d*)$/.exec(templateId);
  if (!match) return null;
  const slide = doc.querySelectorAll(".slide")[Number(match[1]) - 1];
  const template = doc.getElementById(templateId);
  const notes = doc.getElementById("notes");
  const toggle = doc.getElementById("toggle-notes") as HTMLButtonElement | null;
  if (!slide || template?.tagName !== "TEMPLATE" || !notes ||
    toggle?.tagName !== "BUTTON" || toggle.disabled ||
    toggle.getAttribute("aria-expanded") !== String(!notes.hidden)) return null;
  if (!revealCommentSlide(doc, [slide])) return null;
  // Use the deck's notes control so its accessibility and state stay in sync.
  if (notes.hidden) toggle.click();
  return !notes.hidden && toggle.getAttribute("aria-expanded") === "true" ? notes : null;
}
