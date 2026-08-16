import getStroke from "perfect-freehand";
import rough from "roughjs";
import type { Options as RoughOptions } from "roughjs/bin/core";

export type FillStyle = "cross-hatch" | "dots" | "hachure" | "solid" | "zigzag" | "zigzag-line";
export type StrokeStyle = "dashed" | "dotted" | "solid";
export type TextAlign = "center" | "left" | "right";
export type VerticalAlign = "bottom" | "middle" | "top";
export type Arrowhead = "arrow" | "bar" | "circle" | "circle_outline" | "diamond" | "dot" | "triangle";

export type Point = readonly [x: number, y: number];

export interface Roundness {
  readonly type: number;
  readonly value?: number;
}

export interface ExcalidrawElement {
  readonly angle: number;
  readonly backgroundColor: string;
  readonly containerId: string | null;
  readonly endArrowhead: Arrowhead | null;
  readonly fillStyle: FillStyle;
  readonly fontFamily: number;
  readonly fontSize: number;
  readonly height: number;
  readonly id: string;
  readonly lineHeight: number;
  readonly name: string | null;
  readonly opacity: number;
  readonly points: readonly Point[];
  readonly roughness: number;
  readonly roundness: Roundness | null;
  readonly seed: number;
  readonly startArrowhead: Arrowhead | null;
  readonly strokeColor: string;
  readonly strokeStyle: StrokeStyle;
  readonly strokeWidth: number;
  readonly text: string;
  readonly textAlign: TextAlign;
  readonly type: string;
  readonly verticalAlign: VerticalAlign;
  readonly width: number;
  readonly x: number;
  readonly y: number;
}

export interface ExcalidrawScene {
  readonly backgroundColor: string;
  readonly elements: readonly ExcalidrawElement[];
  readonly files: ReadonlyMap<string, string>;
}

export class ExcalidrawParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExcalidrawParseError";
  }
}

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const ELEMENT_LIMIT = 5000;
const SCENE_PADDING = 12;
const DEFAULT_BACKGROUND = "#ffffff";
const DEFAULT_STROKE = "#1e1e1e";
const ADAPTIVE_RADIUS = 32;
const PROPORTIONAL_RADIUS = 0.25;
const ARROWHEAD_LENGTH = 20;
const ARROWHEAD_ANGLE = Math.PI / 6;

// Excalidraw ships Excalifont/Nunito/Cascadia with its editor. The container has
// no network access to fetch them, so each family degrades to the closest stack
// the host already has.
const FONT_STACKS: Readonly<Record<number, string>> = {
  1: '"Excalifont", "Virgil", "Segoe Print", "Bradley Hand", "Comic Sans MS", cursive',
  2: '"Nunito", "Helvetica Neue", Helvetica, Arial, sans-serif',
  3: '"Cascadia Code", "Cascadia Mono", Consolas, "Liberation Mono", monospace',
  5: '"Excalifont", "Virgil", "Segoe Print", "Bradley Hand", "Comic Sans MS", cursive',
  6: '"Nunito", "Helvetica Neue", Helvetica, Arial, sans-serif',
  8: '"Lilita One", "Trebuchet MS", Verdana, sans-serif',
};

function record(value: unknown): Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function stringOr(value: unknown, fallback: string): string {
  return typeof value === "string" && value !== "" ? value : fallback;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

function isTransparent(color: string): boolean {
  return color === "transparent" || color === "" || color === "none";
}

function parsePoints(value: unknown, width: number, height: number): readonly Point[] {
  if (!Array.isArray(value)) {
    return [
      [0, 0],
      [width, height],
    ];
  }
  const points = value
    .map((entry): Point | null => {
      if (!Array.isArray(entry)) return null;
      const [x, y] = entry;
      if (typeof x !== "number" || typeof y !== "number") return null;
      if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
      return [x, y];
    })
    .filter((point): point is Point => point !== null);
  return points.length >= 2 ? points : [[0, 0], [width, height]];
}

function parseRoundness(value: unknown): Roundness | null {
  if (typeof value !== "object" || value === null) return null;
  const source = record(value);
  const type = numberOr(source["type"], 0);
  if (type === 0) return null;
  const radius = source["value"];
  return typeof radius === "number" ? { type, value: radius } : { type };
}

function parseElement(value: unknown): ExcalidrawElement | null {
  const source = record(value);
  const type = source["type"];
  if (typeof type !== "string" || source["isDeleted"] === true) return null;

  const width = Math.abs(numberOr(source["width"], 0));
  const height = Math.abs(numberOr(source["height"], 0));
  const containerId = source["containerId"];
  const name = source["name"];
  const fileId = source["fileId"];

  return {
    angle: numberOr(source["angle"], 0),
    backgroundColor: stringOr(source["backgroundColor"], "transparent"),
    containerId: typeof containerId === "string" ? containerId : null,
    endArrowhead: parseArrowhead(source["endArrowhead"], type === "arrow" ? "arrow" : null),
    fillStyle: oneOf(source["fillStyle"], ["cross-hatch", "dots", "hachure", "solid", "zigzag", "zigzag-line"], "solid"),
    fontFamily: numberOr(source["fontFamily"], 1),
    fontSize: Math.max(1, numberOr(source["fontSize"], 20)),
    height,
    id: stringOr(source["id"], typeof fileId === "string" ? fileId : ""),
    lineHeight: Math.max(0.5, numberOr(source["lineHeight"], 1.25)),
    name: typeof name === "string" ? name : null,
    opacity: Math.min(100, Math.max(0, numberOr(source["opacity"], 100))),
    points: parsePoints(source["points"], width, height),
    roughness: Math.max(0, numberOr(source["roughness"], 1)),
    roundness: parseRoundness(source["roundness"]),
    seed: Math.trunc(numberOr(source["seed"], 1)),
    startArrowhead: parseArrowhead(source["startArrowhead"], null),
    strokeColor: stringOr(source["strokeColor"], DEFAULT_STROKE),
    strokeStyle: oneOf(source["strokeStyle"], ["dashed", "dotted", "solid"], "solid"),
    strokeWidth: Math.max(0.5, numberOr(source["strokeWidth"], 1)),
    text: typeof source["text"] === "string" ? source["text"] : "",
    textAlign: oneOf(source["textAlign"], ["center", "left", "right"], "left"),
    type,
    verticalAlign: oneOf(source["verticalAlign"], ["bottom", "middle", "top"], "top"),
    width,
    x: numberOr(source["x"], 0),
    y: numberOr(source["y"], 0),
  };
}

function parseArrowhead(value: unknown, fallback: Arrowhead | null): Arrowhead | null {
  const allowed: readonly Arrowhead[] = ["arrow", "bar", "circle", "circle_outline", "diamond", "dot", "triangle"];
  if (typeof value !== "string") return fallback;
  return (allowed as readonly string[]).includes(value) ? (value as Arrowhead) : null;
}

// Only data: images are kept. A remote URL in a document would turn rendering a
// Markdown file into a network request that leaks which document was opened.
function parseFiles(value: unknown): ReadonlyMap<string, string> {
  const files = new Map<string, string>();
  for (const [id, entry] of Object.entries(record(value))) {
    const dataUrl = record(entry)["dataURL"];
    if (typeof dataUrl === "string" && /^data:image\/(png|jpeg|gif|webp|svg\+xml);/i.test(dataUrl)) {
      files.set(id, dataUrl);
    }
  }
  return files;
}

export function parseExcalidrawScene(source: string): ExcalidrawScene {
  let payload: unknown;
  try {
    payload = JSON.parse(source) as unknown;
  } catch (error) {
    throw new ExcalidrawParseError(error instanceof Error ? error.message : "Scene is not valid JSON");
  }

  const scene = record(payload);
  const rawElements = scene["elements"];
  if (!Array.isArray(rawElements)) {
    throw new ExcalidrawParseError('Scene has no "elements" array');
  }
  if (rawElements.length > ELEMENT_LIMIT) {
    throw new ExcalidrawParseError(`Scene has ${rawElements.length} elements, above the ${ELEMENT_LIMIT} limit`);
  }

  const elements = rawElements.map(parseElement).filter((element): element is ExcalidrawElement => element !== null);
  if (elements.length === 0) {
    throw new ExcalidrawParseError("Scene contains no drawable elements");
  }

  return {
    backgroundColor: stringOr(record(scene["appState"])["viewBackgroundColor"], DEFAULT_BACKGROUND),
    elements,
    files: parseFiles(scene["files"]),
  };
}

export interface Bounds {
  readonly height: number;
  readonly width: number;
  readonly x: number;
  readonly y: number;
}

export function sceneBounds(elements: readonly ExcalidrawElement[]): Bounds {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const element of elements) {
    const [width, height] = isLinear(element.type)
      ? linearExtent(element.points)
      : ([element.width, element.height] as const);
    // A rotated element sweeps its diagonal, so reserve that instead of its box.
    const diagonal = Math.hypot(width, height);
    const spanX = element.angle === 0 ? width : diagonal;
    const spanY = element.angle === 0 ? height : diagonal;
    const centreX = element.x + width / 2;
    const centreY = element.y + height / 2;

    minX = Math.min(minX, centreX - spanX / 2);
    minY = Math.min(minY, centreY - spanY / 2);
    maxX = Math.max(maxX, centreX + spanX / 2);
    maxY = Math.max(maxY, centreY + spanY / 2);
  }

  return {
    height: Math.max(1, maxY - minY + SCENE_PADDING * 2),
    width: Math.max(1, maxX - minX + SCENE_PADDING * 2),
    x: minX - SCENE_PADDING,
    y: minY - SCENE_PADDING,
  };
}

function isLinear(type: string): boolean {
  return type === "arrow" || type === "line" || type === "freedraw";
}

function linearExtent(points: readonly Point[]): readonly [number, number] {
  let maxX = 0;
  let maxY = 0;
  let minX = 0;
  let minY = 0;
  for (const [x, y] of points) {
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
  }
  return [maxX - minX, maxY - minY];
}

export function cornerRadius(dimension: number, roundness: Roundness): number {
  if (roundness.type === 2) return dimension * PROPORTIONAL_RADIUS;
  const fixed = roundness.value ?? ADAPTIVE_RADIUS;
  return dimension <= fixed / PROPORTIONAL_RADIUS ? dimension * PROPORTIONAL_RADIUS : fixed;
}

// Excalidraw damps roughness on small shapes so they do not dissolve into noise.
export function adjustedRoughness(element: ExcalidrawElement): number {
  const maxSize = Math.max(element.width, element.height);
  const minSize = Math.min(element.width, element.height);
  if (minSize >= 20 && maxSize >= 50) return element.roughness;
  const divisor = maxSize < 10 ? 3 : maxSize < 20 ? 2.5 : maxSize < 50 ? 2 : 1;
  return Math.min(element.roughness / divisor, 2.5);
}

export function dashArray(element: ExcalidrawElement): readonly number[] | undefined {
  if (element.strokeStyle === "dashed") return [8, 8 + element.strokeWidth];
  if (element.strokeStyle === "dotted") return [1.5, 6 + element.strokeWidth];
  return undefined;
}

function roughOptions(element: ExcalidrawElement, filled: boolean): RoughOptions {
  const dashes = dashArray(element);
  const options: RoughOptions = {
    disableMultiStroke: element.strokeStyle !== "solid",
    fillWeight: element.strokeWidth / 2,
    hachureGap: element.strokeWidth * 4,
    preserveVertices: element.roughness < 2,
    roughness: adjustedRoughness(element),
    seed: element.seed,
    stroke: element.strokeColor,
    strokeWidth: element.strokeStyle === "solid" ? element.strokeWidth : element.strokeWidth + 0.5,
  };
  if (dashes !== undefined) options.strokeLineDash = [...dashes];
  if (filled && !isTransparent(element.backgroundColor)) {
    options.fill = element.backgroundColor;
    options.fillStyle = element.fillStyle;
  }
  return options;
}

function roundedRectPath(width: number, height: number, radius: number): string {
  const r = Math.min(radius, width / 2, height / 2);
  return [
    `M ${r} 0`,
    `L ${width - r} 0`,
    `Q ${width} 0 ${width} ${r}`,
    `L ${width} ${height - r}`,
    `Q ${width} ${height} ${width - r} ${height}`,
    `L ${r} ${height}`,
    `Q 0 ${height} 0 ${height - r}`,
    `L 0 ${r}`,
    `Q 0 0 ${r} 0`,
  ].join(" ");
}

function diamondPoints(width: number, height: number): Point[] {
  return [
    [width / 2, 0],
    [width, height / 2],
    [width / 2, height],
    [0, height / 2],
  ];
}

function freedrawPath(element: ExcalidrawElement): string {
  const stroke = getStroke(
    element.points.map(([x, y]) => [x, y]),
    { simulatePressure: true, size: element.strokeWidth * 4.25, thinning: 0.6 },
  );
  if (stroke.length === 0) return "";
  const commands = stroke.map(([x, y], index) => `${index === 0 ? "M" : "L"} ${x} ${y}`);
  return `${commands.join(" ")} Z`;
}

export function arrowheadPoints(tip: Point, from: Point, shape: Arrowhead, size: number): Point[] {
  const angle = Math.atan2(tip[1] - from[1], tip[0] - from[0]);
  const wing = (offset: number): Point => [
    tip[0] - size * Math.cos(angle + offset),
    tip[1] - size * Math.sin(angle + offset),
  ];
  if (shape === "bar") {
    const perpendicular = angle + Math.PI / 2;
    return [
      [tip[0] + (size / 2) * Math.cos(perpendicular), tip[1] + (size / 2) * Math.sin(perpendicular)],
      [tip[0] - (size / 2) * Math.cos(perpendicular), tip[1] - (size / 2) * Math.sin(perpendicular)],
    ];
  }
  if (shape === "diamond") {
    const back: Point = [tip[0] - size * Math.cos(angle), tip[1] - size * Math.sin(angle)];
    const mid: Point = [(tip[0] + back[0]) / 2, (tip[1] + back[1]) / 2];
    const perpendicular = angle + Math.PI / 2;
    return [
      tip,
      [mid[0] + (size / 3) * Math.cos(perpendicular), mid[1] + (size / 3) * Math.sin(perpendicular)],
      back,
      [mid[0] - (size / 3) * Math.cos(perpendicular), mid[1] - (size / 3) * Math.sin(perpendicular)],
    ];
  }
  return [wing(ARROWHEAD_ANGLE), tip, wing(-ARROWHEAD_ANGLE)];
}

// roughjs takes mutable tuples; the scene model keeps its points readonly.
function roughPoints(points: readonly Point[]): [number, number][] {
  return points.map(([x, y]): [number, number] => [x, y]);
}

function createElement<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attributes: Readonly<Record<string, string>>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NAMESPACE, tag);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
  return node;
}

interface RenderContext {
  readonly files: ReadonlyMap<string, string>;
  readonly rough: ReturnType<typeof rough.svg>;
}

function renderArrowhead(
  group: SVGGElement,
  element: ExcalidrawElement,
  tip: Point,
  from: Point,
  shape: Arrowhead,
  context: RenderContext,
): void {
  const size = Math.min(ARROWHEAD_LENGTH, Math.hypot(tip[0] - from[0], tip[1] - from[1]));
  if (size <= 0) return;

  if (shape === "dot" || shape === "circle" || shape === "circle_outline") {
    const options = roughOptions(element, false);
    options.fill = shape === "circle_outline" ? undefined : element.strokeColor;
    options.fillStyle = "solid";
    group.append(context.rough.circle(tip[0], tip[1], size / 2, options));
    return;
  }

  const points = arrowheadPoints(tip, from, shape, size);
  const options = roughOptions(element, false);
  if (shape === "triangle" || shape === "diamond") {
    options.fill = element.strokeColor;
    options.fillStyle = "solid";
    group.append(context.rough.polygon(roughPoints(points), options));
    return;
  }
  group.append(context.rough.linearPath(roughPoints(points), options));
}

function renderText(group: SVGGElement, element: ExcalidrawElement): void {
  const lines = element.text.split("\n");
  const lineBox = element.fontSize * element.lineHeight;
  const anchor = element.textAlign === "center" ? "middle" : element.textAlign === "right" ? "end" : "start";
  const offsetX = element.textAlign === "center" ? element.width / 2 : element.textAlign === "right" ? element.width : 0;
  const blockHeight = lines.length * lineBox;
  const offsetY =
    element.verticalAlign === "middle"
      ? (element.height - blockHeight) / 2
      : element.verticalAlign === "bottom"
        ? element.height - blockHeight
        : 0;

  const text = createElement("text", {
    "dominant-baseline": "central",
    fill: element.strokeColor,
    "font-family": FONT_STACKS[element.fontFamily] ?? FONT_STACKS[1] ?? "sans-serif",
    "font-size": `${element.fontSize}px`,
    "text-anchor": anchor,
    "white-space": "pre",
  });

  for (const [index, line] of lines.entries()) {
    const span = createElement("tspan", {
      x: String(offsetX),
      y: String(offsetY + index * lineBox + lineBox / 2),
    });
    span.textContent = line;
    text.append(span);
  }
  group.append(text);
}

function renderImage(group: SVGGElement, element: ExcalidrawElement, context: RenderContext): void {
  const href = context.files.get(element.id);
  if (href === undefined) {
    group.append(
      context.rough.rectangle(0, 0, element.width, element.height, {
        ...roughOptions(element, false),
        stroke: element.strokeColor,
      }),
    );
    return;
  }
  const image = createElement("image", {
    height: String(element.height),
    preserveAspectRatio: "none",
    width: String(element.width),
    x: "0",
    y: "0",
  });
  image.setAttribute("href", href);
  group.append(image);
}

function renderShape(group: SVGGElement, element: ExcalidrawElement, context: RenderContext): void {
  const { rough: rc } = context;

  switch (element.type) {
    case "rectangle":
    case "embeddable":
    case "iframe":
    case "frame":
    case "magicframe": {
      const options = roughOptions(element, element.type === "rectangle" || element.type === "embeddable");
      if (element.roundness !== null) {
        const radius = cornerRadius(Math.min(element.width, element.height), element.roundness);
        group.append(rc.path(roundedRectPath(element.width, element.height, radius), options));
      } else {
        group.append(rc.rectangle(0, 0, element.width, element.height, options));
      }
      if (element.name !== null) {
        const label = createElement("text", {
          fill: element.strokeColor,
          "font-family": FONT_STACKS[2] ?? "sans-serif",
          "font-size": "14px",
          x: "0",
          y: "-6",
        });
        label.textContent = element.name;
        group.append(label);
      }
      return;
    }
    case "diamond": {
      group.append(rc.polygon(roughPoints(diamondPoints(element.width, element.height)), roughOptions(element, true)));
      return;
    }
    case "ellipse": {
      const options = roughOptions(element, true);
      options.curveFitting = 1;
      group.append(rc.ellipse(element.width / 2, element.height / 2, element.width, element.height, options));
      return;
    }
    case "line":
    case "arrow": {
      const points = element.points.map(([x, y]): Point => [x, y]);
      const closed =
        element.type === "line" &&
        points.length > 2 &&
        Math.hypot(points[0]![0] - points.at(-1)![0], points[0]![1] - points.at(-1)![1]) < 1;
      const options = roughOptions(element, closed);
      group.append(
        element.roundness !== null && points.length > 2
          ? rc.curve(roughPoints(points), options)
          : rc.linearPath(roughPoints(points), options),
      );

      const first = points[0];
      const second = points[1];
      const last = points.at(-1);
      const penultimate = points.at(-2);
      if (element.endArrowhead !== null && last !== undefined && penultimate !== undefined) {
        renderArrowhead(group, element, last, penultimate, element.endArrowhead, context);
      }
      if (element.startArrowhead !== null && first !== undefined && second !== undefined) {
        renderArrowhead(group, element, first, second, element.startArrowhead, context);
      }
      return;
    }
    case "freedraw": {
      const path = freedrawPath(element);
      if (path === "") return;
      group.append(createElement("path", { d: path, fill: element.strokeColor, stroke: "none" }));
      return;
    }
    case "text": {
      renderText(group, element);
      return;
    }
    case "image": {
      renderImage(group, element, context);
      return;
    }
    default:
      return;
  }
}

export function renderExcalidrawScene(scene: ExcalidrawScene): SVGSVGElement {
  const bounds = sceneBounds([...scene.elements]);
  const svg = createElement("svg", {
    "aria-label": "Excalidraw diagram",
    role: "img",
    viewBox: `${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`,
    xmlns: SVG_NAMESPACE,
  });
  svg.style.maxWidth = "100%";
  svg.style.height = "auto";

  if (!isTransparent(scene.backgroundColor)) {
    svg.append(
      createElement("rect", {
        fill: scene.backgroundColor,
        height: String(bounds.height),
        width: String(bounds.width),
        x: String(bounds.x),
        y: String(bounds.y),
      }),
    );
  }

  const context: RenderContext = { files: scene.files, rough: rough.svg(svg) };

  for (const element of scene.elements) {
    const [width, height] = isLinear(element.type)
      ? linearExtent(element.points)
      : ([element.width, element.height] as const);
    const rotation = (element.angle * 180) / Math.PI;
    const group = createElement("g", {
      transform: `translate(${element.x} ${element.y}) rotate(${rotation} ${width / 2} ${height / 2})`,
    });
    if (element.opacity !== 100) group.setAttribute("opacity", String(element.opacity / 100));

    renderShape(group, element, context);
    svg.append(group);
  }

  return svg;
}
