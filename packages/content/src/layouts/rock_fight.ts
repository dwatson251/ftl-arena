/** Room layout "rock_fight": rooms, doors, weapon mounts, hull image box, shield ellipse, gibs. */
import type { ShipLayout } from "@ftl/data";

const layout: ShipLayout = {
  id: "rock_fight",
  xOffset: 0,
  yOffset: 0,
  rooms: [
    { id: 0, x: 1, y: 0, w: 2, h: 2 },
    { id: 1, x: 0, y: 1, w: 1, h: 2 },
    { id: 2, x: 3, y: 1, w: 1, h: 2 },
    { id: 3, x: 1, y: 2, w: 2, h: 1 },
    { id: 4, x: 0, y: 3, w: 2, h: 1 },
    { id: 5, x: 0, y: 4, w: 2, h: 2 },
    { id: 6, x: 0, y: 6, w: 2, h: 1 },
    { id: 7, x: 2, y: 3, w: 2, h: 2 },
    { id: 8, x: 2, y: 5, w: 2, h: 2 },
  ],
  doors: [
    { x: 2, y: 6, a: 6, b: 8, vertical: true },
    { x: 2, y: 5, a: 5, b: 8, vertical: true },
    { x: 2, y: 4, a: 5, b: 7, vertical: true },
    { x: 2, y: 3, a: 4, b: 7, vertical: true },
    { x: 1, y: 3, a: 3, b: 4, vertical: false },
    { x: 2, y: 3, a: 3, b: 7, vertical: false },
    { x: 3, y: 3, a: 2, b: 7, vertical: false },
    { x: 0, y: 3, a: 1, b: 4, vertical: false },
    { x: 1, y: 1, a: 0, b: 1, vertical: true },
    { x: 3, y: 1, a: 0, b: 2, vertical: true },
  ],
  img: { x: -60, y: -65, w: 259, h: 391 },
  floor: { x: 0, y: 0 },
  mounts: [
    { x: 58, y: 90, rotate: false, mirror: true, slide: "left" },
    { x: 202, y: 90, rotate: false, mirror: false, slide: "right" },
    { x: 35, y: 190, rotate: false, mirror: true, slide: "left" },
    { x: 224, y: 190, rotate: false, mirror: false, slide: "right" },
  ],
  ellipse: { a: 139, b: 196, x: 0, y: -104 },
  gibs: [
    { n: 1, x: 21, y: 0, velocity: [0.4, 1], direction: [300, 320], angular: [0.2, 0.6] },
    { n: 2, x: 9, y: 13, velocity: [0.2, 0.4], direction: [0, 90], angular: [-0.2, 0.2] },
    { n: 3, x: 2, y: 56, velocity: [0.1, 0.2], direction: [190, 260], angular: [-0.4, 1] },
    { n: 4, x: 0, y: 144, velocity: [0.3, 0.6], direction: [150, 200], angular: [-0.5, -0.1] },
  ],
};
export default layout;
