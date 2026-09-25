/**
 * Support numbered decks with explicit previous/next controls and an active slide.
 * Use their handlers, never edit slide classes or call guessed global functions.
 * Unknown/asynchronous decks retain the normal hidden-target explanation.
 */
export function revealCommentSlide(doc: Document, elements: Element[]): void {
  const target = elements[0]?.closest(".slide");
  if (!target || elements.some(element => element.closest(".slide") !== target)) return;
  const slides = Array.from(doc.querySelectorAll(".slide"));
  const targetIndex = slides.indexOf(target);
  const next = doc.getElementById("next");
  const previous = doc.getElementById("previous");
  const position = doc.getElementById("position");
  if (next?.tagName !== "BUTTON" || previous?.tagName !== "BUTTON" || !position) return;
  const currentIndex = () => {
    const active = slides.filter(slide => slide.classList.contains("active") && slide.getAttribute("aria-hidden") === "false");
    if (active.length !== 1) return -1;
    const index = slides.indexOf(active[0]);
    const counter = position.textContent?.trim().match(/^(\d+)\s*\/\s*(\d+)$/);
    return counter && Number(counter[1]) === index + 1 && Number(counter[2]) === slides.length ? index : -1;
  };
  let current = currentIndex();
  if (current < 0) return;
  const direction = targetIndex > current ? 1 : -1;
  const control = (direction > 0 ? next : previous) as HTMLButtonElement;
  // Bound work and verify each handler moved exactly one slide before continuing.
  for (let attempts = 0; current !== targetIndex && attempts < slides.length; attempts++) {
    if (control.disabled || !control.isConnected) return;
    control.click();
    const updated = currentIndex();
    if (updated !== current + direction) return;
    current = updated;
  }
}
