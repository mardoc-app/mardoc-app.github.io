import { expect, it } from "vitest";
import { revealCommentSlide, revealCommentNotes } from "@/lib/html-comment-slide";

function deck() {
  document.body.innerHTML = '<button id="previous"></button><button id="next"></button><span id="position">1 / 3</span>' +
    '<section class="slide active" aria-hidden="false"></section><section class="slide" aria-hidden="true"></section><section class="slide" aria-hidden="true"><p>Target</p></section>';
  const slides = Array.from(document.querySelectorAll(".slide"));
  let current=0, calls=0;
  const move = (delta:number) => {
    calls++;
    current+=delta;
    slides.forEach((slide,i) => {slide.classList.toggle("active", i===current);slide.setAttribute("aria-hidden",String(i!==current));});
    document.getElementById("position")!.textContent = (current+1)+" / 3";
  };
  document.getElementById("next")!.onclick=()=>move(1);
  document.getElementById("previous")!.onclick=()=>move(-1);
  return {slides, calls:()=>calls};
}
it("uses controls in both directions and leaves an already active target alone",()=>{
  const {slides,calls}=deck();
  revealCommentSlide(document,[slides[2]]);
  expect(calls()).toBe(2);
  revealCommentSlide(document,[slides[2]]);
  expect(calls()).toBe(2);
  revealCommentSlide(document,[slides[0]]);
  expect(calls()).toBe(4);
});
it("does not operate an unknown deck or span multiple slides",()=>{
  const {slides,calls}=deck();
  revealCommentSlide(document,[slides[1],slides[2]]);
  document.getElementById("position")!.textContent="unknown";
  revealCommentSlide(document,[slides[2]]);
  expect(calls()).toBe(0);
});
it("stops if a control does not synchronously advance one slide",()=>{
  const {slides,calls}=deck();
  document.getElementById("next")!.onclick=()=>{};
  revealCommentSlide(document,[slides[2]]);
  expect(calls()).toBe(0);
  expect(slides[0].classList.contains("active")).toBe(true);
});

it("opens notes using the toggle and does not close already-open notes", () => {
  const {calls} = deck();
  document.body.insertAdjacentHTML("beforeend", '<template id="notes-3"><p>Note</p></template><aside id="notes" hidden></aside><button id="toggle-notes" aria-expanded="false"></button>');
  const notes = document.getElementById("notes")!, toggle = document.getElementById("toggle-notes")!;
  let toggles = 0;
  toggle.onclick = () => {toggles++;notes.hidden=!notes.hidden;toggle.setAttribute("aria-expanded",String(!notes.hidden));};
  expect(revealCommentNotes(document,"notes-3")).toBe(notes);
  expect(calls()).toBe(2);
  expect(toggles).toBe(1);
  expect(revealCommentNotes(document,"notes-3")).toBe(notes);
  expect(toggles).toBe(1);
});
it("refuses unsupported or inconsistent notes controls before navigating", () => {
  const {calls} = deck();
  expect(revealCommentNotes(document,"arbitrary-template")).toBeNull();
  expect(revealCommentNotes(document,"notes-3")).toBeNull();
  expect(calls()).toBe(0);
});
