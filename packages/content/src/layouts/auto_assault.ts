/** Room layout "auto_assault": rooms, doors, weapon mounts, hull image box, shield ellipse, gibs. */
import type { ShipLayout } from "@ftl/data";

const layout: ShipLayout = {
  id: "auto_assault",
  xOffset: 0,
  yOffset: 0,
  rooms: [
    { id: 0, x: 0, y: 1, w: 1, h: 2 },
    { id: 1, x: 1, y: 0, w: 1, h: 2 },
    { id: 2, x: 3, y: 0, w: 1, h: 2 },
    { id: 3, x: 5, y: 0, w: 1, h: 2 },
    { id: 4, x: 6, y: 1, w: 1, h: 2 },
  ],
  doors: [{ x: 6, y: 1, a: 3, b: 4, vertical: true }, { x: 1, y: 1, a: 0, b: 1, vertical: true }],
  img: { x: -84, y: -61, w: 414, h: 252 },
  floor: { x: 0, y: 0 },
  mounts: [
    { x: 150, y: 50, rotate: false, mirror: true, slide: "up" },
    { x: 264, y: 50, rotate: false, mirror: false, slide: "up" },
    { x: 89, y: 65, rotate: false, mirror: true, slide: "up" },
    { x: 324, y: 65, rotate: false, mirror: false, slide: "up" },
  ],
  ellipse: { a: 200, b: 120, x: 0, y: -90 },
  gibs: [
    { n: 1, x: 14, y: 14, velocity: [0.1, 1], direction: [20, 160], angular: [-1, 1] },
    { n: 2, x: 215, y: 19, velocity: [0.1, 0.3], direction: [280, 350], angular: [-1, 1] },
    { n: 3, x: 200, y: 33, velocity: [0.4, 1], direction: [190, 260], angular: [-0.4, 1] },
    { n: 4, x: 114, y: 25, velocity: [0.1, 0.6], direction: [-40, 40], angular: [-0.5, 0.5] },
  ],
};
export default layout;
