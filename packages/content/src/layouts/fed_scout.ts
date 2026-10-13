/** Room layout "fed_scout": rooms, doors, weapon mounts, hull image box, shield ellipse, gibs. */
import type { ShipLayout } from "@ftl/data";

const layout: ShipLayout = {
  id: "fed_scout",
  xOffset: 0,
  yOffset: 0,
  rooms: [
    { id: 0, x: 1, y: 0, w: 2, h: 1 },
    { id: 1, x: 1, y: 1, w: 2, h: 2 },
    { id: 2, x: 0, y: 3, w: 1, h: 2 },
    { id: 3, x: 1, y: 3, w: 2, h: 1 },
    { id: 4, x: 1, y: 4, w: 2, h: 1 },
    { id: 5, x: 3, y: 3, w: 1, h: 2 },
  ],
  doors: [
    { x: 2, y: 1, a: 0, b: 1, vertical: false },
    { x: 1, y: 3, a: 1, b: 3, vertical: false },
    { x: 2, y: 4, a: 3, b: 4, vertical: false },
    { x: 1, y: 4, a: 2, b: 4, vertical: true },
    { x: 3, y: 4, a: 4, b: 5, vertical: true },
  ],
  img: { x: -82, y: -55, w: 303, h: 359 },
  floor: { x: 0, y: 0 },
  mounts: [
    { x: 85, y: 140, rotate: false, mirror: true, slide: "left" },
    { x: 218, y: 140, rotate: false, mirror: false, slide: "right" },
    { x: 116, y: 70, rotate: false, mirror: true, slide: "left" },
    { x: 187, y: 70, rotate: false, mirror: false, slide: "right" },
  ],
  ellipse: { a: 170, b: 205, x: 0, y: -50 },
  gibs: [
    { n: 1, x: 57, y: 1, velocity: [0.1, 1], direction: [20, 160], angular: [-1, 1] },
    { n: 2, x: 151, y: 141, velocity: [0.1, 0.3], direction: [280, 350], angular: [-1, 1] },
    { n: 3, x: 23, y: 58, velocity: [0.4, 1], direction: [190, 260], angular: [-0.4, 1] },
    { n: 4, x: 0, y: 172, velocity: [0.1, 0.6], direction: [-40, 40], angular: [-0.5, 0.5] },
  ],
};
export default layout;
